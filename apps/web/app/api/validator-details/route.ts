import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';
import { formatProgramDisplay } from '@/lib/programRegistry';
import programList from '@/lib/programlist.json';

export async function GET(request: NextRequest) {
  const client = getClickHouseClient();
  const { searchParams } = new URL(request.url);
  
  const validator = searchParams.get('validator');
  const excludeBlacklisted = searchParams.get('excludeBlacklisted') === 'true';

  if (!validator) {
    return NextResponse.json({ error: 'Validator parameter is required' }, { status: 400 });
  }

  try {
    // Get DeFi programs from programlist.json
    const defiPrograms = Object.keys(programList);

    // Get detailed program usage for specific validator (all programs)
    const validatorDetailsQuery = `
      SELECT 
        program_id,
        count() as invocations,
        round(count() * 100.0 / sum(count()) OVER (), 2) as percentage
      FROM ${env.CLICKHOUSE_DB}.program_invocations pi
      WHERE validator = {validator:String}
      ${excludeBlacklisted ? `
      AND program_id NOT IN (
        SELECT program_id FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL 
        WHERE reason != ''
      )` : ''}
      GROUP BY program_id
      ORDER BY invocations DESC
    `;

    console.log('🔍 Executing validator details query for:', validator);

    const result = await client.query({
      query: validatorDetailsQuery,
      query_params: {
        validator: validator
      },
      format: 'JSONEachRow',
    });

    const data = await result.json() as Array<any>;
    
    // Convert to detailed program info
    const programDetails = data.map((row: any) => {
      const { programInfo } = formatProgramDisplay(row.program_id);
      
      return {
        program_id: row.program_id,
        name: programInfo.name,
        invocations: parseInt(row.invocations),
        percentage: parseFloat(row.percentage),
        category: programInfo.category,
        color: programInfo.color,
        bgColor: programInfo.bgColor
      };
    });

    console.log('✅ Successfully fetched details for validator:', validator, 'with', programDetails.length, 'programs');

    return NextResponse.json(programDetails);
  } catch (error) {
    console.error('❌ Error fetching validator details:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}