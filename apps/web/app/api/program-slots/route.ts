import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const validator = searchParams.get('validator');
  const programId = searchParams.get('programId');
  const limit = parseInt(searchParams.get('limit') || '20');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  
  if (!validator || !programId) {
    return NextResponse.json({ error: 'validator and programId are required' }, { status: 400 });
  }

  const client = getClickHouseClient();

  console.log('🔍 Program slots API called with:', {
    validator: validator.slice(0, 8) + '...',
    programId: programId.slice(0, 8) + '...',
    from,
    to,
    limit
  });

  try {
    let query = `
      SELECT 
        slot,
        block_time,
        count() as cnt
      FROM ${env.CLICKHOUSE_DB}.program_invocations
      WHERE validator = {validator:String}
        AND program_id = {programId:String}
    `;

    const queryParams: any = { validator, programId, limit };

    if (from) {
      query += ' AND block_time >= {from:DateTime}';
      queryParams.from = from.replace('Z', '');
    }

    if (to) {
      query += ' AND block_time <= {to:DateTime}';
      queryParams.to = to.replace('Z', '');
    }

    query += `
      GROUP BY slot, block_time
      ORDER BY slot DESC
      LIMIT {limit:UInt32}
    `;

    console.log('📊 Executing query:', query);
    console.log('📊 Query params:', queryParams);

    const result = await client.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const data = await result.json() as any[];
    
    console.log('✅ Query result:', {
      rowCount: data.length,
      firstRow: data[0],
      lastRow: data[data.length - 1]
    });

    // If no data found, provide debugging info
    if (data.length === 0) {
      console.log('🔍 No data found, checking what we have...');
      
      // Check if we have any data for this validator
      const validatorCheck = await client.query({
        query: `SELECT count(*) as cnt FROM ${env.CLICKHOUSE_DB}.program_invocations WHERE validator = {validator:String}`,
        query_params: { validator },
        format: 'JSONEachRow',
      });
      const validatorData = await validatorCheck.json() as any[];
      console.log('📊 Total rows for validator:', validatorData[0]?.cnt || 0);

      // Check if we have any data for this program
      const programCheck = await client.query({
        query: `SELECT count(*) as cnt FROM ${env.CLICKHOUSE_DB}.program_invocations WHERE program_id = {programId:String}`,
        query_params: { programId },
        format: 'JSONEachRow',
      });
      const programData = await programCheck.json() as any[];
      console.log('📊 Total rows for program:', programData[0]?.cnt || 0);

      // Check latest data in database
      const latestCheck = await client.query({
        query: `SELECT max(block_time) as latest_time FROM ${env.CLICKHOUSE_DB}.program_invocations`,
        query_params: {},
        format: 'JSONEachRow',
      });
      const latestData = await latestCheck.json() as any[];
      console.log('📊 Latest data time:', latestData[0]?.latest_time);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Error fetching program slots:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}