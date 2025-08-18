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
      const blacklistData = await blacklistCheck.json();
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

    const data = await result.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching top programs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}