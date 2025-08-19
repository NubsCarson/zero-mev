import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { formatProgramDisplay } from '@/lib/programRegistry';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const validator = searchParams.get('validator');
  const excludeBlacklisted = searchParams.get('excludeBlacklisted') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');


  if (!validator) {
    return NextResponse.json({ error: 'Validator parameter is required' }, { status: 400 });
  }

  try {
    const client = getClickHouseClient();
    
    // Build the blacklist filter
    const blacklistFilter = excludeBlacklisted
      ? `AND program_id NOT IN (
          SELECT program_id 
          FROM solana.program_blacklist 
          WHERE reason != ''
        )`
      : '';

    // Get total count
    const countQuery = `
      SELECT count(DISTINCT slot) as total
      FROM solana.program_invocations
      WHERE validator = {validator:String}
      ${blacklistFilter}
    `;

    const countParams: any = { validator };

    const countResult = await client.query({
      query: countQuery,
      query_params: countParams,
      format: 'JSONEachRow',
    });

    const countData = await countResult.json();
    const total = countData[0]?.total || 0;

    // Get slots with details
    const slotsQuery = `
      SELECT 
        slot,
        max(block_time) as block_time,
        sum(program_invocations) as total_invocations,
        count(DISTINCT program_id) as unique_programs,
        groupArray((program_id, program_invocations)) as programs_data
      FROM (
        SELECT 
          slot,
          block_time,
          program_id,
          count(*) as program_invocations
        FROM solana.program_invocations
        WHERE validator = {validator:String}
        ${blacklistFilter}
        GROUP BY slot, block_time, program_id
      )
      GROUP BY slot
      ORDER BY slot DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `;

    const slotsParams: any = { 
      validator, 
      limit, 
      offset 
    };

    const slotsResult = await client.query({
      query: slotsQuery,
      query_params: slotsParams,
      format: 'JSONEachRow',
    });

    const slotsData = await slotsResult.json();

    // Format the response
    const formattedSlots = slotsData.map((slot: any, index: number) => {
      const programs = slot.programs_data
        .map((p: any[]) => {
          const { programInfo } = formatProgramDisplay(p[0]);
          return {
            program_id: p[0],
            name: programInfo.name,
            invocations: parseInt(p[1])
          };
        })
        .sort((a: any, b: any) => b.invocations - a.invocations);

      const totalInvocations = parseInt(slot.total_invocations);

      return {
        slot: parseInt(slot.slot),
        block_time: slot.block_time,
        total_invocations: totalInvocations,
        unique_programs: parseInt(slot.unique_programs),
        programs
      };
    });

    return NextResponse.json({
      slots: formattedSlots,
      total
    });
  } catch (error) {
    console.error('Error fetching validator slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch validator slots', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}