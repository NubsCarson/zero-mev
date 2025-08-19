import { NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET() {
  const client = getClickHouseClient();

  try {
    // Get validator statistics
    const result = await client.query({
      query: `
        SELECT 
          validator,
          countDistinct(slot) as blocks_processed,
          count() as total_invocations,
          countDistinct(program_id) as unique_programs,
          min(block_time) as first_block_time,
          max(block_time) as last_block_time
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE validator != 'unknown'
        GROUP BY validator
        ORDER BY blocks_processed DESC
        LIMIT 50
      `,
      format: 'JSONEachRow',
    });

    const data = await result.json() as any[];
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching validator stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}