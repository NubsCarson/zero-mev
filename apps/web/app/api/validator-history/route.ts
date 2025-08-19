import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { formatProgramDisplay } from '@/lib/programRegistry';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const validator = searchParams.get('validator');
  const excludeBlacklisted = searchParams.get('excludeBlacklisted') === 'true';

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

    // Get slot range and overall stats
    const rangeQuery = `
      SELECT 
        min(slot) as min_slot,
        max(slot) as max_slot,
        count(DISTINCT slot) as total_slots,
        count(*) as total_invocations,
        count(DISTINCT program_id) as unique_programs,
        min(block_time) as first_block_time,
        max(block_time) as last_block_time
      FROM solana.program_invocations
      WHERE validator = {validator:String}
      ${blacklistFilter}
    `;

    const rangeResult = await client.query({
      query: rangeQuery,
      query_params: { validator },
      format: 'JSONEachRow',
    });

    const rangeData = await rangeResult.json() as Array<any>;
    const stats = rangeData[0];

    if (!stats || stats.total_slots === '0') {
      return NextResponse.json({
        stats: null,
        programs: [],
        message: 'No data found for this validator'
      });
    }

    // Get program usage percentages
    const programQuery = `
      SELECT 
        program_id,
        count(*) as total_invocations,
        count(DISTINCT slot) as slots_used
      FROM solana.program_invocations
      WHERE validator = {validator:String}
      ${blacklistFilter}
      GROUP BY program_id
      ORDER BY total_invocations DESC
    `;

    const programResult = await client.query({
      query: programQuery,
      query_params: { validator },
      format: 'JSONEachRow',
    });

    const programData = await programResult.json() as Array<any>;
    const totalInvocations = parseInt(stats.total_invocations);

    // Format program data with percentages
    const programs = programData.map((program: any) => {
      const { programInfo } = formatProgramDisplay(program.program_id);
      const invocations = parseInt(program.total_invocations);
      const percentage = totalInvocations > 0 ? (invocations / totalInvocations) * 100 : 0;
      const slotUsage = parseInt(program.slots_used);
      const slotPercentage = parseInt(stats.total_slots) > 0 ? (slotUsage / parseInt(stats.total_slots)) * 100 : 0;

      return {
        program_id: program.program_id,
        name: programInfo.name,
        category: programInfo.category,
        color: programInfo.color,
        bgColor: programInfo.bgColor,
        invocations,
        percentage: parseFloat(percentage.toFixed(2)),
        slots_used: slotUsage,
        slot_percentage: parseFloat(slotPercentage.toFixed(2))
      };
    });

    // Format response
    const response = {
      stats: {
        validator,
        min_slot: parseInt(stats.min_slot),
        max_slot: parseInt(stats.max_slot),
        total_slots: parseInt(stats.total_slots),
        total_invocations: parseInt(stats.total_invocations),
        unique_programs: parseInt(stats.unique_programs),
        first_block_time: stats.first_block_time,
        last_block_time: stats.last_block_time,
        slot_range: `${parseInt(stats.min_slot).toLocaleString()} - ${parseInt(stats.max_slot).toLocaleString()}`,
        duration_days: Math.ceil((new Date(stats.last_block_time).getTime() - new Date(stats.first_block_time).getTime()) / (1000 * 60 * 60 * 24))
      },
      programs
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching validator history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch validator history', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}