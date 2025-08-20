import { solanaRpcClient } from '../solana/rpc-client.js';
import { clickHouseManager } from '../database/client.js';
import { Connection } from '@solana/web3.js';

export async function ingestValidatorData(validatorIdentity: string, timeRange: string = '24h') {
  console.log(`📊 Ingesting data for validator ${validatorIdentity} (${timeRange})`);
  
  const connection = new Connection(process.env.SOL_RPC || 'https://rpc.zeroblock.io', 'confirmed');
  
  try {
    const currentSlot = await connection.getSlot();
    let startSlot = currentSlot;
    
    // Calculate slots based on time range (approximately 400ms per slot)
    switch(timeRange) {
      case '1h':
        startSlot = currentSlot - 9000;
        break;
      case '6h':
        startSlot = currentSlot - 54000;
        break;
      case '24h':
        startSlot = currentSlot - 216000;
        break;
      case '7d':
        startSlot = currentSlot - 1512000;
        break;
      case '30d':
        startSlot = currentSlot - 6480000;
        break;
    }
    
    console.log(`🔍 Fetching blocks from slot ${startSlot} to ${currentSlot}`);
    
    // Get leader schedule to find validator's blocks
    const epochInfo = await connection.getEpochInfo();
    const leaderSchedule = await connection.getLeaderSchedule();
    
    let validatorSlots: number[] = [];
    if (leaderSchedule && leaderSchedule[validatorIdentity]) {
      validatorSlots = leaderSchedule[validatorIdentity]
        .map(offset => epochInfo.absoluteSlot - epochInfo.slotIndex + offset)
        .filter(slot => slot >= startSlot && slot <= currentSlot);
    }
    
    console.log(`📦 Found ${validatorSlots.length} slots for validator`);
    
    let processedCount = 0;
    const batchSize = 10;
    
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
            // Analyze program invocations
            const programStats = new Map<string, { count: number, cu: number }>();
            let totalCU = 0;
            
            for (const tx of block.transactions) {
              if (tx.meta && tx.transaction) {
                const computeUnits = tx.meta.computeUnitsConsumed || 0;
                totalCU += computeUnits;
                
                const message = tx.transaction.message;
                const programIds = new Set<string>();
                
                // Get program IDs from instructions
                if ('compiledInstructions' in message) {
                  for (const inst of message.compiledInstructions) {
                    if (message.staticAccountKeys && message.staticAccountKeys[inst.programIdIndex]) {
                      const programId = message.staticAccountKeys[inst.programIdIndex].toBase58();
                      programIds.add(programId);
                    }
                  }
                }
                
                // Get program IDs from inner instructions
                if (tx.meta.innerInstructions) {
                  for (const inner of tx.meta.innerInstructions) {
                    for (const inst of inner.instructions) {
                      if ('programIdIndex' in inst && message.staticAccountKeys && message.staticAccountKeys[inst.programIdIndex]) {
                        const programId = message.staticAccountKeys[inst.programIdIndex].toBase58();
                        programIds.add(programId);
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
              }
            }
            
            // Insert block data
            const blockTime = block.blockTime ? new Date(block.blockTime * 1000) : new Date();
            
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
            const totalInvocations = Array.from(programStats.values()).reduce((sum, stat) => sum + stat.count, 0);
            
            const programUsageData = Array.from(programStats.entries()).map(([programId, stats]) => ({
              slot,
              validatorIdentity,
              programId,
              invocationCount: stats.count,
              percentage: totalInvocations > 0 ? Math.round((stats.count / totalInvocations) * 100 * 100) / 100 : 0, // Round to 2 decimal places
              cuConsumed: stats.cu,
              timestamp: blockTime
            }));
            
            if (programUsageData.length > 0) {
              await clickHouseManager.insertProgramUsage(programUsageData);
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