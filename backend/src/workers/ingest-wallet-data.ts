import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { clickHouseManager } from '../database/client.js';

export async function ingestWalletData(walletAddress: string, timeRange: string = '24h') {
  console.log(`📊 Ingesting data for wallet ${walletAddress} (${timeRange})`);
  
  const connection = new Connection(process.env.SOL_RPC || 'https://rpc.zeroblock.io', 'confirmed');
  
  try {
    const pubkey = new PublicKey(walletAddress);
    
    // Get signatures for the wallet
    const limit = getTransactionLimit(timeRange);
    console.log(`🔍 Fetching up to ${limit} transactions for wallet ${walletAddress}`);
    
    const signatures = await connection.getSignaturesForAddress(pubkey, {
      limit: limit
    });
    
    if (signatures.length === 0) {
      console.log(`⚠️ No transactions found for wallet ${walletAddress}`);
      return 0;
    }
    
    console.log(`📦 Found ${signatures.length} transactions for wallet`);
    
    let processedCount = 0;
    const batchSize = 5; // Process 5 transactions at a time to avoid rate limiting
    
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (sig) => {
        try {
          // Skip if transaction is too old based on timeRange
          if (!isWithinTimeRange(sig.blockTime, timeRange)) {
            return;
          }
          
          const transaction = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });
          
          if (transaction) {
            const txData = analyzeTransaction(transaction, walletAddress);
            
            // Insert transaction data
            await clickHouseManager.insertWalletTransaction({
              signature: sig.signature,
              walletAddress: walletAddress,
              slot: sig.slot,
              blockTime: sig.blockTime ? new Date(sig.blockTime * 1000) : new Date(),
              fee: transaction.meta?.fee || 0,
              status: transaction.meta?.err ? 'failed' : 'success',
              computeUnitsConsumed: transaction.meta?.computeUnitsConsumed || 0,
              programsInvoked: txData.programs,
              transactionType: txData.type,
              amount: txData.amount
            });
            
            // Update program usage for this wallet
            const programUsageData = txData.programs.map(programId => ({
              walletAddress,
              programId,
              invocationCount: 1,
              cuConsumed: (transaction.meta?.computeUnitsConsumed || 0) / txData.programs.length,
              transactionCount: 1,
              timestamp: sig.blockTime ? new Date(sig.blockTime * 1000) : new Date()
            }));
            
            if (programUsageData.length > 0) {
              await clickHouseManager.insertWalletProgramUsage(programUsageData);
            }
            
            processedCount++;
            if (processedCount % 10 === 0) {
              console.log(`✅ Processed ${processedCount}/${signatures.length} transactions`);
            }
          }
        } catch (error) {
          console.error(`Error processing transaction ${sig.signature}:`, error);
        }
      }));
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < signatures.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Update wallet stats
    await updateWalletStats(walletAddress, timeRange);
    
    console.log(`✅ Successfully ingested ${processedCount} transactions for wallet ${walletAddress}`);
    return processedCount;
    
  } catch (error) {
    console.error('Error ingesting wallet data:', error);
    throw error;
  }
}

function analyzeTransaction(transaction: ParsedTransactionWithMeta, walletAddress: string) {
  const programs = new Set<string>();
  let transactionType = 'other';
  let amount: number | null = null;
  
  const message = transaction.transaction.message;
  
  // Get program IDs from instructions - handle both legacy and versioned transactions
  if ('compiledInstructions' in message) {
    // Versioned transaction format
    for (const inst of message.compiledInstructions) {
      if (message.staticAccountKeys && message.staticAccountKeys[inst.programIdIndex]) {
        const programId = message.staticAccountKeys[inst.programIdIndex].toBase58();
        programs.add(programId);
      }
    }
  } else if ('instructions' in message) {
    // Legacy transaction format
    for (const inst of message.instructions) {
      if (message.accountKeys && message.accountKeys[inst.programIdIndex]) {
        const programId = message.accountKeys[inst.programIdIndex].toBase58();
        programs.add(programId);
      }
    }
  }
  
  // Also try parsed instructions for additional program info (if available)
  if (message.instructions && Array.isArray(message.instructions)) {
    for (const instruction of message.instructions) {
      if ('programId' in instruction && instruction.programId) {
        programs.add(instruction.programId.toBase58());
      }
    }
  }
  
  // Get program IDs from inner instructions
  if (transaction.meta?.innerInstructions) {
    for (const inner of transaction.meta.innerInstructions) {
      for (const inst of inner.instructions) {
        if ('programIdIndex' in inst) {
          let programId = null;
          // Try both account key formats
          if (message.staticAccountKeys && message.staticAccountKeys[inst.programIdIndex]) {
            programId = message.staticAccountKeys[inst.programIdIndex].toBase58();
          } else if (message.accountKeys && message.accountKeys[inst.programIdIndex]) {
            programId = message.accountKeys[inst.programIdIndex].toBase58();
          }
          if (programId) {
            programs.add(programId);
          }
        } else if ('programId' in inst && inst.programId) {
          // For parsed inner instructions
          programs.add(inst.programId.toBase58());
        }
      }
    }
  }
  
  // Ensure System Program is always included (every transaction should have it)
  // This is critical - if we don't find it, there's a parsing issue
  programs.add('11111111111111111111111111111111');
  
  // Determine transaction type
  const programArray = Array.from(programs);
  
  if (programArray.includes('11111111111111111111111111111111')) {
    transactionType = 'transfer';
    // Try to extract transfer amount from parsed instructions
    const parsedInstructions = transaction.transaction.message.instructions;
    if (Array.isArray(parsedInstructions)) {
      for (const inst of parsedInstructions) {
        if ('parsed' in inst && inst.parsed?.type === 'transfer') {
          amount = inst.parsed.info?.lamports || null;
        }
      }
    }
  }
  
  if (
    programArray.some(p => 
      p.includes('whirL') || // Whirlpool
      p.includes('675kPX') || // Raydium
      p.includes('JUP') || // Jupiter
      p.includes('9WzDX') // Serum
    )
  ) {
    transactionType = 'swap';
  } else if (programArray.includes('Stake11111111111111111111111111111111111111')) {
    transactionType = 'stake';
  }
  
  return {
    programs: programArray,
    type: transactionType,
    amount
  };
}

function getTransactionLimit(timeRange: string): number {
  switch(timeRange) {
    case '1h':
      return 100;
    case '6h':
      return 500;
    case '24h':
      return 1000;
    case '7d':
      return 5000;
    case '30d':
      return 10000;
    default:
      return 1000;
  }
}

function isWithinTimeRange(blockTime: number | null | undefined, timeRange: string): boolean {
  if (!blockTime) return true; // Include if no timestamp
  
  const now = Date.now() / 1000;
  const age = now - blockTime;
  
  switch(timeRange) {
    case '1h':
      return age <= 3600;
    case '6h':
      return age <= 21600;
    case '24h':
      return age <= 86400;
    case '7d':
      return age <= 604800;
    case '30d':
      return age <= 2592000;
    default:
      return age <= 86400; // Default to 24h
  }
}

async function updateWalletStats(walletAddress: string, timeRange: string) {
  try {
    const stats = await clickHouseManager.calculateWalletStats(walletAddress, timeRange);
    if (stats) {
      await clickHouseManager.insertWalletStats({
        walletAddress,
        totalTransactions: stats.totalTransactions,
        totalCuConsumed: stats.totalCuConsumed,
        uniqueProgramsUsed: stats.uniqueProgramsUsed,
        totalFeesPaid: stats.totalFeesPaid,
        firstTransaction: stats.firstTransaction,
        lastTransaction: stats.lastTransaction,
        timePeriod: timeRange
      });
    }
  } catch (error) {
    console.error('Error updating wallet stats:', error);
  }
}