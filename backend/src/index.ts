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

    // Start block processing
    yellowstoneClient.subscribeToBlocks(async (blockData) => {
      try {
        console.log(`📦 Processing block ${blockData.slot} from validator ${blockData.validatorIdentity}`);

        // PRODUCTION: Skip mock data generation - only use on-demand ingestion
        return;
        
        // const mockTransactions = programAnalyzer.generateMockTransactions(Math.floor(Math.random() * 20) + 5);
        // const analysis = programAnalyzer.analyzeBlock(mockTransactions);

        // COMMENTED OUT - using on-demand ingestion only
        // await clickHouseManager.insertBlock(...);
        // await clickHouseManager.insertProgramUsage(...);
        // console.log(`✅ Processed block ${blockData.slot} with ${analysis.programUsage.length} unique programs`);
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