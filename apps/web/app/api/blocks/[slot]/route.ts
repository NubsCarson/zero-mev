import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(
  request: NextRequest,
  { params }: { params: { slot: string } }
) {
  const client = getClickHouseClient();
  const slot = parseInt(params.slot);

  if (isNaN(slot)) {
    return NextResponse.json({ error: 'Invalid slot number' }, { status: 400 });
  }

  try {
    // Get block details
    const blockResult = await client.query({
      query: `
        SELECT 
          slot,
          block_time,
          validator,
          count() as total_invocations,
          countDistinct(program_id) as unique_programs,
          countDistinct(tx_sig) as unique_transactions
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE slot = {slot:UInt64}
        GROUP BY slot, block_time, validator
      `,
      query_params: { slot },
      format: 'JSONEachRow',
    });

    const blockData = await blockResult.json() as any[];
    
    if (blockData.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    // Get top programs for this block
    const programsResult = await client.query({
      query: `
        SELECT 
          program_id,
          count() as invocations,
          countDistinct(tx_sig) as transactions
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE slot = {slot:UInt64}
        GROUP BY program_id
        ORDER BY invocations DESC
        LIMIT 20
      `,
      query_params: { slot },
      format: 'JSONEachRow',
    });

    const programsData = await programsResult.json() as any[];

    return NextResponse.json({
      block: blockData[0],
      programs: programsData,
    });
  } catch (error) {
    console.error('Error fetching block details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}