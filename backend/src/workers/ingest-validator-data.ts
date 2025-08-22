import { solanaRpcClient } from '../solana/rpc-client.js';
import { clickHouseManager } from '../database/client.js';
import { Connection } from '@solana/web3.js';

export async function ingestValidatorData(validatorIdentity: string, timeRange: string = '24h') {
  console.log(`📊 Ingesting data for validator ${validatorIdentity} (${timeRange})`);
  
  const connection = new Connection(process.env.SOL_RPC || 'https://rpc.zeroblock.io', 'confirmed');
  
  try {
    const currentSlot = await connection.getSlot();
    let slotsPerHour = 9000; // Approximately 400ms per slot = 9000 slots per hour
    
    // Calculate initial time range in slots
    let timeRangeSlots: number;
    switch(timeRange) {
      case '1h':
        timeRangeSlots = slotsPerHour;
        break;
      case '6h':
        timeRangeSlots = slotsPerHour * 6;
        break;
      case '24h':
        timeRangeSlots = slotsPerHour * 24;
        break;
      case '7d':
        timeRangeSlots = slotsPerHour * 24 * 7;
        break;
      case '30d':
        timeRangeSlots = slotsPerHour * 24 * 30;
        break;
      default:
        timeRangeSlots = slotsPerHour * 24;
    }
    
    let validatorSlots: number[] = [];
    
    // Use the exact timeframe requested by the user
    const requestedHours = timeRangeSlots / slotsPerHour;
    const startSlot = currentSlot - timeRangeSlots;
      
    console.log(`🔍 Searching for validator blocks from slot ${startSlot} to ${currentSlot} (${requestedHours}h window)`);
      
    // Get multiple epochs of leader schedules to increase chances of finding the validator
    const epochInfo = await connection.getEpochInfo();
    const epochs = [epochInfo.epoch - 1, epochInfo.epoch, epochInfo.epoch + 1]; // Previous, current, next epoch
    
    for (const epoch of epochs) {
      try {
        const leaderSchedule = await connection.getLeaderSchedule(null, { epoch });
        if (leaderSchedule && leaderSchedule[validatorIdentity]) {
          const epochSlots = leaderSchedule[validatorIdentity]
            .map(offset => {
              // Calculate absolute slot based on epoch
              if (epoch === epochInfo.epoch) {
                return epochInfo.absoluteSlot - epochInfo.slotIndex + offset;
              } else if (epoch === epochInfo.epoch - 1) {
                // Previous epoch - estimate based on slots per epoch (432000)
                return (epochInfo.absoluteSlot - epochInfo.slotIndex) - 432000 + offset;
              } else {
                // Next epoch
                return (epochInfo.absoluteSlot - epochInfo.slotIndex) + 432000 + offset;
              }
            })
            .filter(slot => slot >= startSlot && slot <= currentSlot);
          
          validatorSlots.push(...epochSlots);
        }
      } catch (error) {
        console.log(`⚠️ Could not get leader schedule for epoch ${epoch}:`, error.message);
      }
    }
    
    // Remove duplicates and sort
    validatorSlots = [...new Set(validatorSlots)].sort((a, b) => a - b);
    
    console.log(`📦 Found ${validatorSlots.length} slots for validator in ${requestedHours}h window`);
    
    if (validatorSlots.length === 0) {
      console.log(`⚠️ No slots found for validator ${validatorIdentity} in ${requestedHours}h window`);
      return 0;
    }
    
    let processedCount = 0;
    const batchSize = 2; // Further reduce batch size to avoid rate limiting
    
    for (let i = 0; i < validatorSlots.length; i += batchSize) {
      const batch = validatorSlots.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (slot) => {
        try {
          const block = await connection.getBlock(slot, {
            maxSupportedTransactionVersion: 0,
            transactionDetails: 'full',
            rewards: false
          });
          
          if (block) {
            // Calculate block time first
            const blockTime = block.blockTime ? new Date(block.blockTime * 1000) : new Date();
            
            // Analyze program invocations and collect wallet transactions
            const programStats = new Map<string, { count: number, cu: number }>();
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
            let totalCU = 0;
            
            for (const tx of block.transactions) {
              if (tx.meta && tx.transaction) {
                const computeUnits = tx.meta.computeUnitsConsumed || 0;
                totalCU += computeUnits;
                
                const message = tx.transaction.message;
                const programIds = new Set<string>();
                
                // Get program IDs from instructions - handle both legacy and versioned transactions
                if ('compiledInstructions' in message) {
                  // Versioned transaction format
                  for (const inst of message.compiledInstructions) {
                    if (message.staticAccountKeys && message.staticAccountKeys[inst.programIdIndex]) {
                      const programId = message.staticAccountKeys[inst.programIdIndex].toBase58();
                      programIds.add(programId);
                    }
                  }
                } else if ('instructions' in message) {
                  // Legacy transaction format
                  for (const inst of message.instructions) {
                    if (message.accountKeys && message.accountKeys[inst.programIdIndex]) {
                      const programId = message.accountKeys[inst.programIdIndex].toBase58();
                      programIds.add(programId);
                    }
                  }
                }
                
                // Get program IDs from inner instructions
                if (tx.meta.innerInstructions) {
                  for (const inner of tx.meta.innerInstructions) {
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
                          programIds.add(programId);
                        }
                      }
                    }
                  }
                }
                
                // Update stats
                const cuPerProgram = programIds.size > 0 ? Math.floor(computeUnits / programIds.size) : 0;
                for (const programId of programIds) {
                  const existing = programStats.get(programId) || { count: 0, cu: 0 };
                  programStats.set(programId, {
                    count: existing.count + 1,
                    cu: existing.cu + cuPerProgram
                  });
                }
                
                // Collect wallet transaction data
                try {
                  const signature = tx.transaction.signatures?.[0] || '';
                  const fee = tx.meta.fee || 0;
                  const status = tx.meta.err ? 'failed' : 'success';
                  
                  // Get wallet addresses from transaction accounts
                  const message = tx.transaction.message;
                  let accountKeys: string[] = [];
                  
                  if ('staticAccountKeys' in message) {
                    // Versioned transaction
                    accountKeys = message.staticAccountKeys.map(key => key.toBase58());
                  } else if ('accountKeys' in message) {
                    // Legacy transaction
                    accountKeys = message.accountKeys.map(key => key.toBase58());
                  }
                  
                  // The first account is usually the fee payer (primary wallet)
                  if (accountKeys.length > 0) {
                    const walletAddress = accountKeys[0];
                    
                    // Determine transaction type and amount
                    let transactionType = 'unknown';
                    let amount: number | null = null;
                    
                    // Check for common transaction types based on program IDs
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
                    if (tx.meta.preBalances && tx.meta.postBalances && tx.meta.preBalances.length > 0 && tx.meta.postBalances.length > 0) {
                      const preBalance = tx.meta.preBalances[0];
                      const postBalance = tx.meta.postBalances[0];
                      amount = Math.abs(postBalance - preBalance);
                    }
                    
                    walletTransactions.push({
                      signature,
                      slot,
                      blockTime: blockTime,
                      fee,
                      status,
                      computeUnitsConsumed: computeUnits,
                      programsInvoked: Array.from(programIds),
                      transactionType,
                      amount,
                      walletAddress
                    });
                  }
                } catch (walletError) {
                  // Don't fail the whole block processing if wallet extraction fails
                  console.log(`⚠️ Failed to extract wallet data from transaction: ${walletError.message}`);
                }
              }
            }
            
            // Only store blocks that contain vote transactions (every validator block should have these)
            const programUsageData = Array.from(programStats.entries()).map(([programId, stats]) => ({
              slot,
              validatorIdentity,
              programId,
              invocationCount: stats.count,
              cuConsumed: stats.cu,
              timestamp: blockTime
            }));
            
            // Check if block contains vote transactions (it should for every validator block)
            const hasVoteTransactions = programStats.has('Vote111111111111111111111111111111111111111');
            
            // Debug: Log if no vote transactions found (this shouldn't happen)
            if (!hasVoteTransactions) {
              console.log(`⚠️ Block ${slot} for validator ${validatorIdentity} has no vote transactions! Programs found:`, Array.from(programStats.keys()));
            }
            
            if (hasVoteTransactions && programUsageData.length > 0) {
              // Insert block data only if we have program usage
              
              await clickHouseManager.insertBlock({
                slot,
                hash: block.blockhash,
                parentHash: block.previousBlockhash,
                validatorIdentity,
                timestamp: blockTime,
                transactionCount: block.transactions.length,
                totalCuConsumed: totalCU
              });
              
              // Insert program usage data
              await clickHouseManager.insertProgramUsage(programUsageData);
              
              // Insert wallet transactions if we have any
              if (walletTransactions.length > 0) {
                await clickHouseManager.insertWalletTransactions(walletTransactions);
              }
            }
            
            processedCount++;
            if (processedCount % 10 === 0) {
              console.log(`✅ Processed ${processedCount}/${validatorSlots.length} blocks`);
            }
          }
        } catch (error) {
          console.error(`Error processing slot ${slot}:`, error);
        }
      }));
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < validatorSlots.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increase delay to 2s
      }
    }
    
    console.log(`✅ Successfully ingested ${processedCount} blocks for validator ${validatorIdentity}`);
    return processedCount;
    
  } catch (error) {
    console.error('Error ingesting validator data:', error);
    throw error;
  }
}

// Function to continuously ingest recent blocks
export async function startContinuousIngestion(validatorIdentity: string) {
  console.log(`🔄 Starting continuous ingestion for validator ${validatorIdentity}`);
  
  const connection = new Connection(process.env.SOL_RPC || 'https://rpc.zeroblock.io', 'confirmed');
  let lastProcessedSlot = await connection.getSlot();
  
  setInterval(async () => {
    try {
      const currentSlot = await connection.getSlot();
      
      if (currentSlot > lastProcessedSlot) {
        // Process new slots
        for (let slot = lastProcessedSlot + 1; slot <= currentSlot; slot++) {
          try {
            // Check if this slot belongs to our validator
            const leaderSchedule = await connection.getLeaderSchedule(slot);
            let isValidatorSlot = false;
            
            if (leaderSchedule) {
              for (const [validator, slots] of Object.entries(leaderSchedule)) {
                if (validator === validatorIdentity && slots.includes(slot % 432000)) {
                  isValidatorSlot = true;
                  break;
                }
              }
            }
            
            if (isValidatorSlot) {
              console.log(`📦 Processing new slot ${slot} for validator ${validatorIdentity}`);
              await ingestValidatorData(validatorIdentity, '1h');
            }
          } catch (error) {
            console.error(`Error checking slot ${slot}:`, error);
          }
        }
        
        lastProcessedSlot = currentSlot;
      }
    } catch (error) {
      console.error('Error in continuous ingestion:', error);
    }
  }, 5000); // Check every 5 seconds
}