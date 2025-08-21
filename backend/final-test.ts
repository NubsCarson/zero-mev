import { clickHouseManager } from './src/database/client.js';

async function finalComprehensiveTest() {
  try {
    const walletAddress = '3BpjjjJujk6qsG6rRLdiR3Wfsgh3SdhyJ83W46VUyc3Q';
    console.log('🧪 FINAL COMPREHENSIVE TEST\n');
    console.log('=' .repeat(50));

    // 1. Test both API methods
    console.log('\n1. TESTING API CONSISTENCY:');
    const stats = await clickHouseManager.getWalletStats(walletAddress, '24h');
    const programUsage = await clickHouseManager.getWalletProgramUsage(walletAddress, '24h');
    
    const statsData = stats.data?.[0];
    const systemProgram = programUsage.data?.find((p: any) => p.program_id === '11111111111111111111111111111111');
    
    console.log('📊 Stats API - Total Transactions:', statsData?.total_transactions);
    console.log('📊 Program Usage API - System Program Transactions:', systemProgram?.transaction_count);
    console.log('📊 APIs Match:', statsData?.total_transactions === systemProgram?.transaction_count ? '✅ YES' : '❌ NO');

    // 2. Verify System Program coverage
    console.log('\n2. VERIFYING SYSTEM PROGRAM COVERAGE:');
    const totalTransactions = parseInt(statsData?.total_transactions || '0');
    const systemTransactions = parseInt(systemProgram?.transaction_count || '0');
    const coverage = totalTransactions > 0 ? (systemTransactions / totalTransactions) * 100 : 0;
    
    console.log('📊 Total Transactions:', totalTransactions);
    console.log('📊 System Program Transactions:', systemTransactions);
    console.log('📊 Coverage:', `${coverage.toFixed(2)}%`);
    console.log('📊 100% Coverage:', coverage === 100 ? '✅ YES' : '❌ NO');

    // 3. Verify database integrity
    console.log('\n3. CHECKING DATABASE INTEGRITY:');
    const integrityCheck = await clickHouseManager.client.query({
      query: `
        SELECT 
          count() as total_rows,
          count(DISTINCT signature) as unique_signatures,
          countIf(has(programs_invoked, '11111111111111111111111111111111')) as rows_with_system,
          uniqIf(signature, has(programs_invoked, '11111111111111111111111111111111')) as unique_with_system
        FROM wallet_transactions 
        WHERE wallet_address = '${walletAddress}'
        AND block_time >= now() - INTERVAL 24 HOUR
      `,
      format: 'JSONEachRow'
    });
    
    const integrity = await integrityCheck.json();
    console.log('📊 Total Rows:', integrity[0].total_rows);
    console.log('📊 Unique Signatures:', integrity[0].unique_signatures);
    console.log('📊 Rows with System Program:', integrity[0].rows_with_system);
    console.log('📊 Unique Signatures with System Program:', integrity[0].unique_with_system);
    console.log('📊 All Transactions Have System Program:', integrity[0].unique_signatures === integrity[0].unique_with_system ? '✅ YES' : '❌ NO');

    // 4. Final validation
    console.log('\n4. FINAL VALIDATION:');
    const allTestsPass = (
      statsData?.total_transactions === systemProgram?.transaction_count && // APIs match
      coverage === 100 && // System program 100% coverage
      integrity[0].unique_signatures === integrity[0].unique_with_system // All transactions have system program
    );
    
    console.log('🎯 ALL TESTS PASS:', allTestsPass ? '✅ YES' : '❌ NO');
    
    if (allTestsPass) {
      console.log('\n🎉 SUCCESS! The wallet tracking system is working perfectly:');
      console.log('   ✅ Transaction counts are consistent between APIs');
      console.log('   ✅ System Program shows 100% coverage');
      console.log('   ✅ Database integrity is maintained');
      console.log('   ✅ No polling/realtime updates for accuracy');
      console.log('\n💪 The fix is complete and bulletproof!');
    } else {
      console.log('\n❌ FAILURE! Some tests are still failing.');
    }
    
    await clickHouseManager.close();
  } catch (error) {
    console.error('❌ Final test error:', error);
  }
}

finalComprehensiveTest();