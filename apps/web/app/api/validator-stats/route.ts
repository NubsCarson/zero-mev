import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';
import { formatProgramDisplay } from '@/lib/programRegistry';
import programList from '@/lib/programlist.json';

interface ValidatorProgramStat {
  validator: string;
  program_id: string;
  invocations: number;
}

interface ValidatorStat {
  validator: string;
  total_invocations: number;
  unique_programs: number;
  top_programs: Array<{
    program_id: string;
    name: string;
    invocations: number;
    percentage: number;
    category: string;
    color: string;
    bgColor: string;
  }>;
}

export async function GET(request: NextRequest) {
  const client = getClickHouseClient();
  const { searchParams } = new URL(request.url);
  
  const limit = parseInt(searchParams.get('limit') || '50');
  const excludeBlacklisted = searchParams.get('excludeBlacklisted') === 'true';

  try {
    // Define system programs to exclude
    const systemPrograms = [
      'Vote111111111111111111111111111111111111111', // Vote Program
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
      '11111111111111111111111111111111', // System Program
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token 2022 Program
      'ComputeBudget111111111111111111111111111111', // Compute Budget Program
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
      'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo', // Rent Program
      'SysvarRent111111111111111111111111111111111', // Sysvar Rent
      'SysvarC1ock11111111111111111111111111111111', // Sysvar Clock
      'Sysvar1nstructions1111111111111111111111111' // Sysvar Instructions
    ];

    // Get DeFi programs from programlist.json
    const defiPrograms = Object.keys(programList);

    // First, get overall validator stats (all programs, not just DeFi)
    const validatorStatsQuery = `
      SELECT 
        validator,
        count() as total_invocations,
        uniq(program_id) as unique_programs
      FROM ${env.CLICKHOUSE_DB}.program_invocations pi
      WHERE 1=1
      ${excludeBlacklisted ? `
      AND program_id NOT IN (
        SELECT program_id FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL 
        WHERE reason != ''
      )` : ''}
      GROUP BY validator
      ORDER BY total_invocations DESC
      LIMIT ${limit}
    `;

    console.log('🔍 Executing validator stats query:', validatorStatsQuery);

    const validatorStatsResult = await client.query({
      query: validatorStatsQuery,
      query_params: {},
      format: 'JSONEachRow',
    });

    const validatorStatsData = await validatorStatsResult.json() as Array<any>;
    console.log('📊 Found', validatorStatsData.length, 'validators');

    // For each validator, get their top programs
    const validatorStats: ValidatorStat[] = await Promise.all(
      validatorStatsData.map(async (validator: any) => {
        const topProgramsQuery = `
          SELECT 
            program_id,
            count() as invocations
          FROM ${env.CLICKHOUSE_DB}.program_invocations pi
          WHERE validator = {validator:String}
          ${excludeBlacklisted ? `
          AND program_id NOT IN (
            SELECT program_id FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL 
            WHERE reason != ''
          )` : ''}
          GROUP BY program_id
          ORDER BY invocations DESC
          LIMIT 5
        `;

        const topProgramsResult = await client.query({
          query: topProgramsQuery,
          query_params: {
            validator: validator.validator
          },
          format: 'JSONEachRow',
        });

        const topProgramsData = await topProgramsResult.json() as Array<any>;
        
        const top_programs = topProgramsData.map((program: any) => {
          const { programInfo } = formatProgramDisplay(program.program_id);
          const invocations = parseInt(program.invocations);
          const percentage = validator.total_invocations > 0 
            ? (invocations / parseInt(validator.total_invocations)) * 100 
            : 0;

          return {
            program_id: program.program_id,
            name: programInfo.name,
            invocations,
            percentage,
            category: programInfo.category,
            color: programInfo.color,
            bgColor: programInfo.bgColor
          };
        });

        return {
          validator: validator.validator,
          total_invocations: parseInt(validator.total_invocations),
          unique_programs: parseInt(validator.unique_programs),
          top_programs
        };
      })
    );

    console.log('✅ Successfully processed validator stats for', validatorStats.length, 'validators');

    return NextResponse.json(validatorStats);
  } catch (error) {
    console.error('❌ Error fetching validator stats:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}