import { startServer } from './api/server.js';
import { yellowstoneClient } from './grpc/yellowstone-client.js';
import { clickHouseManager } from './database/client.js';
import { programAnalyzer } from './processors/program-analyzer.js';

async function main() {
  console.log('🚀 Starting Solana Validator Analytics System...');

  try {
    // Initialize components
    await yellowstoneClient.initialize();
    await clickHouseManager.initialize();

    // Start the API server
    await startServer();

    // Start block processing with real data
    yellowstoneClient.subscribeToBlocks(async (blockData) => {
      try {
        console.log(`📦 Processing block ${blockData.slot} from validator ${blockData.validatorIdentity}`);

        // Process real transaction data from the block
        if (blockData.transactions && blockData.transactions.length > 0) {
          console.log(`📊 Block ${blockData.slot} has ${blockData.transactions.length} transactions`);
          // Debug: log the first transaction structure
          if (blockData.transactions[0]) {
            const tx = blockData.transactions[0];
            console.log('🔍 Sample transaction keys:', Object.keys(tx));
            if (tx.transaction) {
              console.log('🔍 Transaction.message keys:', Object.keys(tx.transaction.message || {}));
              console.log('🔍 Instructions count:', tx.transaction.message?.instructions?.length || 0);
            } else {
              console.log('🔍 No transaction field found');
            }
          }
          const analysis = programAnalyzer.analyzeBlock(blockData.transactions);
          
          // Collect wallet transaction data from all transactions
          const walletTransactions: Array<{
            signature: string;
            slot: number;
            blockTime: Date;
            fee: number;
            status: string;
            computeUnitsConsumed: number;
            programsInvoked: string[];
            transactionType: string;
            amount: number | null;
            walletAddress: string;
          }> = [];

          for (const tx of blockData.transactions) {
            try {
              if (tx.meta && tx.transaction) {
                const signature = tx.transaction.signatures?.[0] || '';
                const fee = tx.meta.fee || 0;
                const status = tx.meta.err ? 'failed' : 'success';
                const computeUnits = tx.meta.computeUnitsConsumed || 0;
                
                const message = tx.transaction.message;
                const programIds = new Set<string>();
                
                // Extract program IDs from instructions
                if ('compiledInstructions' in message) {
                  // Versioned transaction format
                  for (const inst of message.compiledInstructions || []) {
                    if (message.staticAccountKeys && message.staticAccountKeys[inst.programIdIndex]) {
                      const programId = message.staticAccountKeys[inst.programIdIndex].toString();
                      programIds.add(programId);
                    }
                  }
                } else if ('instructions' in message) {
                  // Legacy transaction format
                  for (const inst of message.instructions || []) {
                    if (message.accountKeys && message.accountKeys[inst.programIdIndex]) {
                      const programId = message.accountKeys[inst.programIdIndex].toString();
                      programIds.add(programId);
                    }
                  }
                }
                
                // Extract program IDs from inner instructions
                if (tx.meta.innerInstructions) {
                  for (const inner of tx.meta.innerInstructions) {
                    for (const inst of inner.instructions) {
                      if ('programIdIndex' in inst) {
                        let programId = null;
                        if (message.staticAccountKeys && message.staticAccountKeys[inst.programIdIndex]) {
                          programId = message.staticAccountKeys[inst.programIdIndex].toString();
                        } else if (message.accountKeys && message.accountKeys[inst.programIdIndex]) {
                          programId = message.accountKeys[inst.programIdIndex].toString();
                        }
                        if (programId) {
                          programIds.add(programId);
                        }
                      }
                    }
                  }
                }
                
                // Get wallet addresses
                let accountKeys: string[] = [];
                if ('staticAccountKeys' in message) {
                  accountKeys = message.staticAccountKeys.map(key => key.toString());
                } else if ('accountKeys' in message) {
                  accountKeys = message.accountKeys.map(key => key.toString());
                }
                
                // The first account is usually the fee payer (primary wallet)
                if (accountKeys.length > 0) {
                  const walletAddress = accountKeys[0];
                  
                  // Determine transaction type
                  let transactionType = 'unknown';
                  if (programIds.has('11111111111111111111111111111111')) {
                    transactionType = 'system';
                  } else if (programIds.has('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
                    transactionType = 'token';
                  } else if (programIds.has('Vote111111111111111111111111111111111111111')) {
                    transactionType = 'vote';
                  } else if (programIds.has('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')) {
                    transactionType = 'swap';
                  } else if (programIds.size > 0) {
                    transactionType = 'program';
                  }
                  
                  // Try to extract amount from pre/post balances
                  let amount: number | null = null;
                  if (tx.meta.preBalances && tx.meta.postBalances && tx.meta.preBalances.length > 0 && tx.meta.postBalances.length > 0) {
                    const preBalance = tx.meta.preBalances[0];
                    const postBalance = tx.meta.postBalances[0];
                    amount = Math.abs(postBalance - preBalance);
                  }
                  
                  walletTransactions.push({
                    signature,
                    slot: blockData.slot,
                    blockTime: blockData.timestamp,
                    fee,
                    status,
                    computeUnitsConsumed: computeUnits,
                    programsInvoked: Array.from(programIds),
                    transactionType,
                    amount,
                    walletAddress
                  });
                }
              }
            } catch (error) {
              // Don't fail the whole block processing if wallet extraction fails
              console.log(`⚠️ Failed to extract wallet data from transaction: ${error.message}`);
            }
          }
          
          // Only store blocks that contain vote transactions (every validator block should have these)
          const hasVoteTransactions = analysis.programUsage.some(program => program.programId === 'Vote111111111111111111111111111111111111111');
          
          // Debug: Log if no vote transactions found (this shouldn't happen)
          if (!hasVoteTransactions) {
            console.log(`⚠️ Block ${blockData.slot} for validator ${blockData.validatorIdentity} has no vote transactions! Programs found:`, analysis.programUsage.map(p => p.programId));
          }
          
          if (hasVoteTransactions && analysis.programUsage.length > 0) {
            // Store block metadata only if we have vote transactions
            await clickHouseManager.insertBlock({
              slot: blockData.slot,
              hash: blockData.hash,
              parentHash: blockData.parentHash,
              timestamp: blockData.timestamp,
              validatorIdentity: blockData.validatorIdentity,
              transactionCount: blockData.transactions.length,
              totalCuConsumed: analysis.totalCuConsumed,
            });

            // Store program usage data
            const programUsageData = analysis.programUsage.map(program => ({
              slot: blockData.slot,
              validatorIdentity: blockData.validatorIdentity,
              programId: program.programId,
              invocationCount: program.invocationCount,
              cuConsumed: program.cuConsumed,
              timestamp: blockData.timestamp,
            }));
            
            await clickHouseManager.insertProgramUsage(programUsageData);
            
            // Store wallet transaction data
            if (walletTransactions.length > 0) {
              try {
                await clickHouseManager.insertWalletTransactions(walletTransactions);
              } catch (walletError) {
                if (walletError?.type === 'UNKNOWN_TABLE') {
                  console.warn(`⚠️ wallet_transactions table does not exist, skipping wallet data for block ${blockData.slot}`);
                } else {
                  console.error(`❌ Error inserting wallet transactions for block ${blockData.slot}:`, walletError);
                }
              }
            }
          }

          console.log(`✅ Processed block ${blockData.slot} with ${analysis.programUsage.length} unique programs, ${analysis.totalInstructions} instructions, ${walletTransactions.length} wallet transactions`);
        } else {
          console.log(`📦 Block ${blockData.slot} has no transactions to process`);
        }
      } catch (error) {
        console.error(`❌ Error processing block ${blockData.slot}:`, error);
      }
    });

    console.log('✅ System initialized and running!');
  } catch (error) {
    console.error('❌ Failed to initialize system:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  try {
    await yellowstoneClient.close();
    await clickHouseManager.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  
  try {
    await yellowstoneClient.close();
    await clickHouseManager.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the application
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});