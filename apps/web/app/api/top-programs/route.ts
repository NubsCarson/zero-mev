import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const validator = searchParams.get('validator') || 'all';
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = parseInt(searchParams.get('limit') || '50');
  const excludeBlacklisted = searchParams.get('excludeBlacklisted') === 'true';

  const client = getClickHouseClient();

  try {
    let query = `
      SELECT 
        program_id,
        sum(cnt) as cnt
      FROM ${env.CLICKHOUSE_DB}.invocations_hour
    `;

    const conditions: string[] = [];
    const queryParams: any = { limit };

    if (from) {
      conditions.push('ts_hour >= {from:DateTime}');
      queryParams.from = from.replace('Z', '');
    }

    if (to) {
      conditions.push('ts_hour <= {to:DateTime}');
      queryParams.to = to.replace('Z', '');
    }

    if (validator !== 'all') {
      conditions.push('validator = {validator:String}');
      queryParams.validator = validator;
    }

    if (excludeBlacklisted) {
      // First check if there are any blacklisted programs
      const blacklistCheck = await client.query({
        query: `SELECT count() FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL WHERE reason != ''`,
        format: 'JSONEachRow',
      });
      const blacklistData = await blacklistCheck.json() as Array<{ 'count()': number }>;
      const hasBlacklist = blacklistData[0]?.['count()'] > 0;
      
      if (hasBlacklist) {
        query = `
          SELECT 
            ih.program_id,
            sum(ih.cnt) as cnt
          FROM ${env.CLICKHOUSE_DB}.invocations_hour ih
          LEFT JOIN (
            SELECT DISTINCT program_id 
            FROM ${env.CLICKHOUSE_DB}.program_blacklist 
            FINAL 
            WHERE reason != ''
          ) pb ON ih.program_id = pb.program_id
          ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') + ' AND' : 'WHERE'} pb.program_id IS NULL
          GROUP BY ih.program_id
          ORDER BY cnt DESC
          LIMIT {limit:UInt32}
        `;
      } else {
        // No blacklist, proceed normally
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        query += `
          GROUP BY program_id
          ORDER BY cnt DESC
          LIMIT {limit:UInt32}
        `;
      }
    } else {
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += `
        GROUP BY program_id
        ORDER BY cnt DESC
        LIMIT {limit:UInt32}
      `;
    }

    const result = await client.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const data = await result.json() as any[];
    
    console.log('📊 Top programs query result:', {
      validator: validator.slice(0, 8) + '...',
      from,
      to,
      dataLength: data.length,
      firstFew: data.slice(0, 3).map(d => ({ program_id: d.program_id.slice(0, 8) + '...', cnt: d.cnt }))
    });
    
    // Debug: if no data and we're looking at specific validator, check what validators we have
    if (data.length === 0 && validator !== 'all') {
      console.log('🔍 No data for validator, checking available validators...');
      const validatorCheckQuery = `
        SELECT validator, count(*) as cnt 
        FROM ${env.CLICKHOUSE_DB}.program_invocations 
        WHERE block_time >= now() - INTERVAL 24 HOUR
        GROUP BY validator 
        ORDER BY cnt DESC 
        LIMIT 10
      `;
      
      const validatorResult = await client.query({
        query: validatorCheckQuery,
        query_params: {},
        format: 'JSONEachRow',
      });
      
      const validatorData = await validatorResult.json() as any[];
      console.log('📊 Top 10 active validators in last 24 hours:', validatorData);
      
      // Also check what data exists for this specific validator
      const specificValidatorQuery = `
        SELECT count(*) as total_rows, min(block_time) as earliest, max(block_time) as latest
        FROM ${env.CLICKHOUSE_DB}.program_invocations 
        WHERE validator = {validator:String}
      `;
      
      const specificResult = await client.query({
        query: specificValidatorQuery,
        query_params: { validator },
        format: 'JSONEachRow',
      });
      
      const specificData = await specificResult.json() as any[];
      console.log('📊 Data for specific validator:', specificData[0]);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching top programs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}