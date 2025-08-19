import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(
  request: NextRequest,
  { params }: { params: { validator: string } }
) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');
  
  const client = getClickHouseClient();
  const validator = params.validator;

  try {
    // Get blocks processed by this validator
    const result = await client.query({
      query: `
        SELECT 
          slot,
          block_time,
          validator,
          count() as total_invocations,
          countDistinct(program_id) as unique_programs,
          countDistinct(tx_sig) as unique_transactions
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE validator = {validator:String}
        GROUP BY slot, block_time, validator
        ORDER BY slot DESC
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}
      `,
      query_params: { validator, limit, offset },
      format: 'JSONEachRow',
    });

    const data = await result.json() as any[];
    
    // Get total count for pagination
    const countResult = await client.query({
      query: `
        SELECT countDistinct(slot) as total
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE validator = {validator:String}
      `,
      query_params: { validator },
      format: 'JSONEachRow',
    });

    const countData = await countResult.json() as any[];
    const total = countData[0]?.total || 0;

    return NextResponse.json({
      blocks: data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching validator blocks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}