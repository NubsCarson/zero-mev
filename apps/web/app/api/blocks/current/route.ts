import { NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET() {
  const client = getClickHouseClient();

  try {
    // Get the latest blocks with their details
    const result = await client.query({
      query: `
        SELECT 
          slot,
          formatDateTime(block_time, '%Y-%m-%dT%H:%M:%SZ', 'UTC') as block_time,
          validator,
          count() as total_invocations,
          countDistinct(program_id) as unique_programs,
          countDistinct(tx_sig) as unique_transactions
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE slot >= (SELECT max(slot) - 20 FROM ${env.CLICKHOUSE_DB}.program_invocations)
        GROUP BY slot, block_time, validator
        ORDER BY slot DESC
        LIMIT 20
      `,
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching current blocks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}