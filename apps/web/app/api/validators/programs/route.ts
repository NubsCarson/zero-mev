import { NextRequest } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const client = getClickHouseClient();
    
    const query = `
      SELECT 
        validator,
        program_id,
        count() as total_invocations,
        countDistinct(slot) as slots_used,
        countDistinct(tx_sig) as unique_transactions
      FROM ${env.CLICKHOUSE_DB}.program_invocations
      WHERE program_id NOT IN (
        SELECT program_id FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL 
        WHERE reason != ''
      )
      GROUP BY validator, program_id
      ORDER BY validator, total_invocations DESC
    `;
    
    console.log('🔍 Executing validator programs query...');
    
    const result = await client.query({
      query,
      format: 'JSONEachRow',
    });
    
    const rawData = await result.json() as any[];
    
    // Group by validator and take top programs for each
    const validatorPrograms: Record<string, any[]> = {};
    
    rawData.forEach(row => {
      if (!validatorPrograms[row.validator]) {
        validatorPrograms[row.validator] = [];
      }
      
      // Take top 5 programs per validator
      if (validatorPrograms[row.validator].length < 5) {
        validatorPrograms[row.validator].push({
          program_id: row.program_id,
          total_invocations: parseInt(row.total_invocations),
          slots_used: parseInt(row.slots_used),
          unique_transactions: parseInt(row.unique_transactions),
          percentage: 0 // Will calculate this later
        });
      }
    });
    
    // Calculate percentages for each validator
    Object.keys(validatorPrograms).forEach(validator => {
      const programs = validatorPrograms[validator];
      const totalInvocations = programs.reduce((sum, p) => sum + p.total_invocations, 0);
      
      programs.forEach(program => {
        program.percentage = totalInvocations > 0 
          ? (program.total_invocations / totalInvocations) * 100 
          : 0;
      });
    });
    
    console.log(`✅ Successfully fetched program data for ${Object.keys(validatorPrograms).length} validators`);
    
    return Response.json(validatorPrograms);
    
  } catch (error) {
    console.error('❌ Error fetching validator programs:', error);
    return Response.json(
      { error: 'Failed to fetch validator programs' },
      { status: 500 }
    );
  }
}