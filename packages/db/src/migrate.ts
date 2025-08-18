import { getClickHouseClient } from './client';
import { env } from './env';

async function migrate() {
  const client = getClickHouseClient();
  
  console.log('Running ClickHouse migrations...');
  
  try {
    // Create database if not exists
    await client.exec({
      query: `CREATE DATABASE IF NOT EXISTS ${env.CLICKHOUSE_DB}`,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
    
    console.log(`✓ Database ${env.CLICKHOUSE_DB} ready`);
    
    // Create program_invocations table
    await client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${env.CLICKHOUSE_DB}.program_invocations (
          slot UInt64,
          block_time DateTime,
          validator String,
          program_id String,
          tx_sig String,
          instruction_ix UInt16,
          source LowCardinality(String)
        ) ENGINE = MergeTree()
        ORDER BY (slot, program_id)
        PARTITION BY toYYYYMM(block_time)
      `,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
    
    console.log('✓ Table program_invocations created');
    
    // Create program_blacklist table
    await client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${env.CLICKHOUSE_DB}.program_blacklist (
          program_id String,
          reason String,
          added_at DateTime DEFAULT now()
        ) ENGINE = ReplacingMergeTree(added_at)
        ORDER BY program_id
      `,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
    
    console.log('✓ Table program_blacklist created');
    
    // Create invocations_hour table
    await client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${env.CLICKHOUSE_DB}.invocations_hour (
          ts_hour DateTime,
          validator String,
          program_id String,
          cnt UInt64
        ) ENGINE = SummingMergeTree(cnt)
        ORDER BY (ts_hour, validator, program_id)
        PARTITION BY toYYYYMM(ts_hour)
      `,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
    
    console.log('✓ Table invocations_hour created');
    
    // Create materialized view
    await client.exec({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${env.CLICKHOUSE_DB}.mv_invocations_hour
        TO ${env.CLICKHOUSE_DB}.invocations_hour
        AS SELECT
          toStartOfHour(block_time) AS ts_hour,
          validator,
          program_id,
          count() AS cnt
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        GROUP BY ts_hour, validator, program_id
      `,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });
    
    console.log('✓ Materialized view mv_invocations_hour created');
    
    console.log('✅ All migrations completed successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  migrate();
}