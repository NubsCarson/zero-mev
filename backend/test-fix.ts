import { clickHouseManager } from './src/database/client.js';

async function testFix() {
  try {
    const walletAddress = '3BpjjjJujk6qsG6rRLdiR3Wfsgh3SdhyJ83W46VUyc3Q';
    console.log('🧪 Testing the fix...\n');

    // Test both APIs
    const stats = await clickHouseManager.getWalletStats(walletAddress, '24h');
    const programUsage = await clickHouseManager.getWalletProgramUsage(walletAddress, '24h');
    
    const statsData = stats.data?.[0];
    const systemProgram = programUsage.data?.find((p: any) => p.program_id === '11111111111111111111111111111111');
    
    console.log('📊 Stats API - Total Transactions:', statsData?.total_transactions);
    console.log('📊 Program Usage API - System Program Transactions:', systemProgram?.transaction_count);
    
    const match = statsData?.total_transactions === systemProgram?.transaction_count;
    console.log('📊 APIs Match:', match ? '✅ YES' : '❌ NO');
    
    if (match) {
      const percentage = 100; // Should be 100% since System Program is in every transaction
      console.log('📊 System Program Coverage:', `${percentage}%`);
      console.log('✅ FIX SUCCESSFUL!');
    } else {
      console.log('❌ Fix incomplete, values still don\'t match');
    }
    
    await clickHouseManager.close();
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testFix();