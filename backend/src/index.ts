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
          
          // Store block metadata
          await clickHouseManager.insertBlock({
            slot: blockData.slot,
            hash: blockData.hash,
            parentHash: blockData.parentHash,
            timestamp: blockData.timestamp,
            validatorIdentity: blockData.validatorIdentity,
            transactionCount: blockData.transactions.length,
            totalInstructions: analysis.totalInstructions,
            totalCuConsumed: analysis.totalCuConsumed,
          });

          // Store program usage data
          if (analysis.programUsage.length > 0) {
            const programUsageData = analysis.programUsage.map(program => ({
              slot: blockData.slot,
              validatorIdentity: blockData.validatorIdentity,
              programId: program.programId,
              invocationCount: program.invocationCount,
              cuConsumed: program.cuConsumed,
              timestamp: blockData.timestamp,
            }));
            
            await clickHouseManager.insertProgramUsage(programUsageData);
          }

          console.log(`✅ Processed block ${blockData.slot} with ${analysis.programUsage.length} unique programs, ${analysis.totalInstructions} instructions`);
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