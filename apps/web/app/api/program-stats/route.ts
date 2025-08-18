import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const programId = searchParams.get('programId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const by = searchParams.get('by') || 'hour';
  const validator = searchParams.get('validator') || 'all';

  if (!programId) {
    return NextResponse.json({ error: 'programId is required' }, { status: 400 });
  }

  const client = getClickHouseClient();

  try {
    const tsField = by === 'day' ? 'toStartOfDay(ts_hour)' : 'ts_hour';
    
    let query = `
      SELECT 
        ${tsField} as ts,
        sum(cnt) as cnt
      FROM ${env.CLICKHOUSE_DB}.invocations_hour
      WHERE program_id = {programId:String}
    `;

    const queryParams: any = { programId };

    if (from) {
      query += ' AND ts_hour >= {from:DateTime}';
      queryParams.from = from.replace('Z', '');
    }

    if (to) {
      query += ' AND ts_hour <= {to:DateTime}';
      queryParams.to = to.replace('Z', '');
    }

    if (validator !== 'all') {
      query += ' AND validator = {validator:String}';
      queryParams.validator = validator;
    }

    query += `
      GROUP BY ts
      ORDER BY ts ASC
    `;

    const result = await client.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching program stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}