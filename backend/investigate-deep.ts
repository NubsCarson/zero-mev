import { clickHouseManager } from './src/database/client.js';

async function deepInvestigation() {
  try {
    const walletAddress = '3BpjjjJujk6qsG6rRLdiR3Wfsgh3SdhyJ83W46VUyc3Q';
    console.log('🔍 Deep investigation of transaction counting discrepancy...\n');

    // 1. Raw database counts
    console.log('1. RAW DATABASE COUNTS:');
    const rawResult = await clickHouseManager.client.query({
      query: `
        SELECT 
          count() as total_rows,
          count(DISTINCT signature) as unique_signatures,
          min(block_time) as earliest,
          max(block_time) as latest,
          countIf(block_time >= now() - INTERVAL 24 HOUR) as rows_last_24h,
          uniqIf(signature, block_time >= now() - INTERVAL 24 HOUR) as unique_sigs_last_24h
        FROM wallet_transactions 
        WHERE wallet_address = '${walletAddress}'
      `,
      format: 'JSONEachRow'
    });
    const rawData = await rawResult.json();
    console.log('Raw counts:', rawData[0]);

    // 2. Stats API result
    console.log('\n2. STATS API RESULT:');
    const stats = await clickHouseManager.getWalletStats(walletAddress, '24h');
    console.log('Stats result structure:', Object.keys(stats));
    const statsData = stats.data?.[0] || stats;
    console.log('Stats total transactions:', statsData.total_transactions || statsData.totalTransactions);

    // 3. Program Usage API result
    console.log('\n3. PROGRAM USAGE API RESULT:');
    const programUsage = await clickHouseManager.getWalletProgramUsage(walletAddress, '24h');
    const systemProgram = programUsage.data?.find((p: any) => p.program_id === '11111111111111111111111111111111');
    console.log('System Program transaction count:', systemProgram?.transaction_count);
    console.log('Total programs found:', programUsage.data?.length || 0);

    // 4. Check time filter impact
    console.log('\n4. TIME FILTER ANALYSIS:');
    const timeFilterTest = await clickHouseManager.client.query({
      query: `
        WITH time_boundaries AS (
          SELECT now() - INTERVAL 24 HOUR as start_time
        )
        SELECT 
          'All time' as period,
          count() as total_rows,
          count(DISTINCT signature) as unique_sigs
        FROM wallet_transactions 
        WHERE wallet_address = '${walletAddress}'
        
        UNION ALL
        
        SELECT 
          '24h filter' as period,
          count() as total_rows,
          count(DISTINCT signature) as unique_sigs
        FROM wallet_transactions, time_boundaries
        WHERE wallet_address = '${walletAddress}'
        AND block_time >= time_boundaries.start_time
      `,
      format: 'JSONEachRow'
    });
    const timeData = await timeFilterTest.json();
    console.log('Time filter comparison:', timeData);

    // 5. Check actual System Program coverage
    console.log('\n5. SYSTEM PROGRAM COVERAGE CHECK:');
    const systemCoverageResult = await clickHouseManager.client.query({
      query: `
        SELECT 
          count(DISTINCT signature) as total_unique_transactions,
          countIf(has(programs_invoked, '11111111111111111111111111111111')) as transactions_with_system,
          (countIf(has(programs_invoked, '11111111111111111111111111111111')) * 100.0 / count(DISTINCT signature)) as system_coverage_percent
        FROM wallet_transactions 
        WHERE wallet_address = '${walletAddress}'
        AND block_time >= now() - INTERVAL 24 HOUR
      `,
      format: 'JSONEachRow'
    });
    const coverageData = await systemCoverageResult.json();
    console.log('System Program coverage:', coverageData[0]);

    await clickHouseManager.close();
  } catch (error) {
    console.error('❌ Investigation error:', error);
  }
}

deepInvestigation();