#!/usr/bin/env node

import { createClient } from '@clickhouse/client';
import { config } from '../src/config/index.js';

async function cleanupInvalidBlocks() {
  console.log('🧹 Starting cleanup of invalid blocks (blocks without vote transactions)');
  
  const client = createClient({
    host: config.clickhouse.url,
    database: config.clickhouse.database,
    username: config.clickhouse.username,
    password: config.clickhouse.password,
  });
  
  try {
    // Test connection
    await client.ping();
    console.log('✅ ClickHouse connection established');
    
    // First, let's see how many blocks we have before cleanup
    const beforeQuery = `
      SELECT 
        COUNT(*) as total_blocks,
        COUNT(DISTINCT validator_identity) as total_validators
      FROM blocks
    `;
    
    const beforeResult = await client.query({ query: beforeQuery, format: 'JSON' });
    const beforeData = await beforeResult.json();
    console.log('📊 Before cleanup:', beforeData.data[0]);
    
    // Find blocks that don't have vote transactions
    const invalidBlocksQuery = `
      SELECT 
        b.slot,
        b.validator_identity,
        COUNT(pu.slot) as program_count,
        SUM(CASE WHEN pu.program_id = 'Vote111111111111111111111111111111111111111' THEN 1 ELSE 0 END) as vote_program_count
      FROM blocks b
      LEFT JOIN program_usage pu ON b.slot = pu.slot AND b.validator_identity = pu.validator_identity
      GROUP BY b.slot, b.validator_identity
      HAVING vote_program_count = 0
      ORDER BY b.slot DESC
    `;
    
    const invalidBlocksResult = await client.query({ query: invalidBlocksQuery, format: 'JSON' });
    const invalidBlocksData = await invalidBlocksResult.json();
    console.log(`❌ Found ${invalidBlocksData.data.length} invalid blocks without vote transactions`);
    
    if (invalidBlocksData.data.length > 0) {
      // Show a sample of invalid blocks
      console.log('📋 Sample of invalid blocks:');
      invalidBlocksData.data.slice(0, 5).forEach(block => {
        console.log(`  - Slot ${block.slot} (Validator: ${block.validator_identity.slice(0, 8)}...) - ${block.program_count} programs, ${block.vote_program_count} vote programs`);
      });
      
      console.log('🗑️ Deleting invalid blocks and their program usage data...');
      
      // Delete program usage data for invalid blocks first
      for (const block of invalidBlocksData.data) {
        await client.exec({
          query: `DELETE FROM program_usage WHERE slot = ${block.slot} AND validator_identity = '${block.validator_identity}'`
        });
      }
      
      // Delete the invalid blocks themselves
      for (const block of invalidBlocksData.data) {
        await client.exec({
          query: `DELETE FROM blocks WHERE slot = ${block.slot} AND validator_identity = '${block.validator_identity}'`
        });
      }
      
      console.log('✅ Deleted invalid blocks and their program usage data');
    }
    
    // Check the results after cleanup
    const afterResult = await client.query({ query: beforeQuery, format: 'JSON' });
    const afterData = await afterResult.json();
    console.log('📊 After cleanup:', afterData.data[0]);
    
    // Verify vote program coverage
    const coverageQuery = `
      SELECT 
        validator_identity,
        COUNT(DISTINCT slot) as total_blocks,
        SUM(CASE WHEN program_id = 'Vote111111111111111111111111111111111111111' THEN 1 ELSE 0 END) as vote_blocks,
        ROUND((SUM(CASE WHEN program_id = 'Vote111111111111111111111111111111111111111' THEN 1 ELSE 0 END) * 100.0) / COUNT(DISTINCT slot), 2) as vote_coverage_percent
      FROM program_usage 
      GROUP BY validator_identity
      HAVING total_blocks > 0
      ORDER BY vote_coverage_percent ASC, total_blocks DESC
      LIMIT 10
    `;
    
    const coverageResult = await client.query({ query: coverageQuery, format: 'JSON' });
    const coverageData = await coverageResult.json();
    console.log('🗳️ Vote program coverage by validator (lowest coverage first):');
    coverageData.data.forEach(row => {
      console.log(`  - ${row.validator_identity.slice(0, 12)}...: ${row.vote_coverage_percent}% (${row.vote_blocks}/${row.total_blocks} blocks)`);
    });
    
    console.log('✅ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// Run the cleanup
cleanupInvalidBlocks().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});