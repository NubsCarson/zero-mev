import { clickHouseManager } from './src/database/client.js';

async function debugStatsAPI() {
  try {
    const walletAddress = '3BpjjjJujk6qsG6rRLdiR3Wfsgh3SdhyJ83W46VUyc3Q';
    console.log('🔍 Debugging Stats API query...\n');

    // Manually run the exact same query as getWalletStats with time filter
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h ago

    console.log('Time filter start:', start.toISOString());
    console.log('Current time:', now.toISOString());

    const exactStatsQuery = await clickHouseManager.client.query({
      query: `
        SELECT 
          count(DISTINCT signature) as totalTransactions,
          sum(compute_units_consumed) as totalCuConsumed,
          uniqExact(arrayJoin(programs_invoked)) as uniqueProgramsUsed,
          sum(fee) as totalFeesPaid,
          min(block_time) as firstTransaction,
          max(block_time) as lastTransaction
        FROM wallet_transactions 
        WHERE wallet_address = '${walletAddress}'
          AND block_time >= '${start.toISOString().replace('T', ' ').replace('Z', '')}'
      `,
      format: 'JSONEachRow'
    });
    
    const exactResult = await exactStatsQuery.json();
    console.log('Direct stats query result:', exactResult[0]);

    // Compare with the API method
    console.log('\nAPI method result:');
    const apiResult = await clickHouseManager.getWalletStats(walletAddress, '24h');
    console.log('API result:', apiResult);

    // Check if there's time zone or formatting issues
    console.log('\nTesting various time formats:');
    const formatTests = [
      start.toISOString(),
      start.toISOString().replace('T', ' ').replace('Z', ''),
      start.toISOString().replace('T', ' ').replace('.000Z', ''),
    ];

    for (const timeFormat of formatTests) {
      const testResult = await clickHouseManager.client.query({
        query: `
          SELECT 
            count(DISTINCT signature) as totalTransactions,
            '${timeFormat}' as time_format_used
          FROM wallet_transactions 
          WHERE wallet_address = '${walletAddress}'
            AND block_time >= '${timeFormat}'
        `,
        format: 'JSONEachRow'
      });
      
      const testData = await testResult.json();
      console.log(`Format "${timeFormat}": ${testData[0].totalTransactions} transactions`);
    }

    await clickHouseManager.close();
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugStatsAPI();