import { NextRequest } from 'next/server';
import { getClickHouseClient } from '../../../../../../../packages/db/src';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { validator: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'day';
    const validator = params.validator;

    if (!validator) {
      return Response.json(
        { error: 'Validator address is required' },
        { status: 400 }
      );
    }

    const client = getClickHouseClient();
    
    // Calculate the time filter based on period
    let timeFilter = '';
    let periodLabel = '';
    switch (period) {
      case 'day':
        timeFilter = 'block_time >= now() - INTERVAL 1 DAY';
        periodLabel = 'Last 24 Hours';
        break;
      case '3days':
        timeFilter = 'block_time >= now() - INTERVAL 3 DAY';
        periodLabel = 'Last 3 Days';
        break;
      case 'week':
        timeFilter = 'block_time >= now() - INTERVAL 7 DAY';
        periodLabel = 'Last Week';
        break;
      case 'month':
        timeFilter = 'block_time >= now() - INTERVAL 30 DAY';
        periodLabel = 'Last Month';
        break;
      default:
        timeFilter = 'block_time >= now() - INTERVAL 1 DAY';
        periodLabel = 'Last 24 Hours';
    }
    
    const query = `
      SELECT 
        program_id,
        count() as total_invocations,
        countDistinct(slot) as slots_used,
        countDistinct(tx_sig) as unique_transactions,
        min(block_time) as first_seen,
        max(block_time) as last_seen
      FROM ${env.CLICKHOUSE_DB}.program_invocations
      WHERE validator = {validator:String}
        AND ${timeFilter}
        AND program_id NOT IN (
          SELECT program_id FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL 
          WHERE reason != ''
        )
      GROUP BY program_id
      ORDER BY total_invocations DESC
    `;
    
    console.log(`🔍 Analyzing validator ${validator} for period: ${period}`);
    
    const result = await client.query({
      query,
      query_params: {
        validator,
      },
      format: 'JSONEachRow',
    });
    
    const rawData = await result.json() as any[];
    
    // Calculate percentages
    const totalInvocations = rawData.reduce((sum, row) => sum + parseInt(row.total_invocations), 0);
    
    const programData = rawData.map(row => ({
      program_id: row.program_id,
      total_invocations: parseInt(row.total_invocations),
      slots_used: parseInt(row.slots_used),
      unique_transactions: parseInt(row.unique_transactions),
      percentage: totalInvocations > 0 ? (parseInt(row.total_invocations) / totalInvocations) * 100 : 0,
      first_seen: row.first_seen,
      last_seen: row.last_seen
    }));

    // Get validator summary stats
    const summaryQuery = `
      SELECT 
        count() as total_invocations,
        countDistinct(slot) as total_slots,
        countDistinct(program_id) as unique_programs,
        min(block_time) as period_start,
        max(block_time) as period_end
      FROM ${env.CLICKHOUSE_DB}.program_invocations
      WHERE validator = {validator:String}
        AND ${timeFilter}
        AND program_id NOT IN (
          SELECT program_id FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL 
          WHERE reason != ''
        )
    `;

    const summaryResult = await client.query({
      query: summaryQuery,
      query_params: {
        validator,
      },
      format: 'JSONEachRow',
    });

    const summaryData = await summaryResult.json() as any[];
    const summary = summaryData[0] || {};
    
    console.log(`✅ Found ${programData.length} programs for validator ${validator} (${period})`);
    
    return Response.json({
      validator,
      period,
      periodLabel,
      summary: {
        total_invocations: parseInt(summary.total_invocations || '0'),
        total_slots: parseInt(summary.total_slots || '0'),
        unique_programs: parseInt(summary.unique_programs || '0'),
        period_start: summary.period_start,
        period_end: summary.period_end
      },
      programs: programData
    });
    
  } catch (error) {
    console.error('❌ Error analyzing validator:', error);
    return Response.json(
      { error: 'Failed to analyze validator' },
      { status: 500 }
    );
  }
}