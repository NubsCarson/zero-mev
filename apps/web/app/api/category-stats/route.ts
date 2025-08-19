import { NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';
import { formatProgramDisplay } from '@/lib/programRegistry';

export async function GET() {
  const client = getClickHouseClient();

  try {
    // Get program invocation counts from recent blocks
    const result = await client.query({
      query: `
        SELECT 
          program_id,
          count() as invocations
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE slot >= (SELECT max(slot) - 20 FROM ${env.CLICKHOUSE_DB}.program_invocations)
        GROUP BY program_id
        ORDER BY invocations DESC
      `,
      format: 'JSONEachRow',
    });

    const data = await result.json();
    
    // Categorize programs and aggregate by category
    const categoryMap = new Map<string, { count: number; color: string }>();
    let totalInvocations = 0;

    data.forEach((row: any) => {
      const { programInfo } = formatProgramDisplay(row.program_id);
      const category = programInfo.category;
      const invocations = parseInt(row.invocations);
      
      totalInvocations += invocations;
      
      if (categoryMap.has(category)) {
        categoryMap.get(category)!.count += invocations;
      } else {
        categoryMap.set(category, { 
          count: invocations, 
          color: programInfo.color 
        });
      }
    });

    // Convert to array and calculate percentages
    const categoryStats = Array.from(categoryMap.entries())
      .map(([category, { count, color }]) => ({
        category,
        count,
        percentage: totalInvocations > 0 ? (count / totalInvocations) * 100 : 0,
        color
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending

    return NextResponse.json(categoryStats);
  } catch (error) {
    console.error('Error fetching category stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}