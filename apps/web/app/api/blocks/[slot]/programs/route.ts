import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../../../packages/db/src';
import { env } from '@/lib/env';
import { formatProgramDisplay } from '@/lib/programRegistry';

// Generate 56 unique color combinations
const generateProgramColors = () => {
  const colors = [
    'text-blue-400', 'text-emerald-400', 'text-red-400', 'text-purple-400',
    'text-orange-400', 'text-pink-400', 'text-cyan-400', 'text-yellow-400',
    'text-indigo-400', 'text-green-400', 'text-rose-400', 'text-violet-400',
    'text-amber-400', 'text-teal-400', 'text-lime-400', 'text-fuchsia-400',
    'text-sky-400', 'text-slate-400', 'text-gray-400', 'text-zinc-400',
    'text-neutral-400', 'text-stone-400', 'text-red-300', 'text-orange-300',
    'text-yellow-300', 'text-green-300', 'text-blue-300', 'text-indigo-300',
    'text-purple-300', 'text-pink-300', 'text-cyan-300', 'text-teal-300',
    'text-emerald-300', 'text-lime-300', 'text-amber-300', 'text-rose-300',
    'text-violet-300', 'text-fuchsia-300', 'text-sky-300', 'text-slate-300',
    'text-red-500', 'text-orange-500', 'text-yellow-500', 'text-green-500',
    'text-blue-500', 'text-indigo-500', 'text-purple-500', 'text-pink-500',
    'text-cyan-500', 'text-teal-500', 'text-emerald-500', 'text-lime-500',
    'text-amber-500', 'text-rose-500', 'text-violet-500', 'text-fuchsia-500'
  ];
  
  const bgColors = [
    'bg-blue-500/20', 'bg-emerald-500/20', 'bg-red-500/20', 'bg-purple-500/20',
    'bg-orange-500/20', 'bg-pink-500/20', 'bg-cyan-500/20', 'bg-yellow-500/20',
    'bg-indigo-500/20', 'bg-green-500/20', 'bg-rose-500/20', 'bg-violet-500/20',
    'bg-amber-500/20', 'bg-teal-500/20', 'bg-lime-500/20', 'bg-fuchsia-500/20',
    'bg-sky-500/20', 'bg-slate-500/20', 'bg-gray-500/20', 'bg-zinc-500/20',
    'bg-neutral-500/20', 'bg-stone-500/20', 'bg-red-400/20', 'bg-orange-400/20',
    'bg-yellow-400/20', 'bg-green-400/20', 'bg-blue-400/20', 'bg-indigo-400/20',
    'bg-purple-400/20', 'bg-pink-400/20', 'bg-cyan-400/20', 'bg-teal-400/20',
    'bg-emerald-400/20', 'bg-lime-400/20', 'bg-amber-400/20', 'bg-rose-400/20',
    'bg-violet-400/20', 'bg-fuchsia-400/20', 'bg-sky-400/20', 'bg-slate-400/20',
    'bg-red-600/20', 'bg-orange-600/20', 'bg-yellow-600/20', 'bg-green-600/20',
    'bg-blue-600/20', 'bg-indigo-600/20', 'bg-purple-600/20', 'bg-pink-600/20',
    'bg-cyan-600/20', 'bg-teal-600/20', 'bg-emerald-600/20', 'bg-lime-600/20',
    'bg-amber-600/20', 'bg-rose-600/20', 'bg-violet-600/20', 'bg-fuchsia-600/20'
  ];

  return colors.map((color, index) => ({
    color,
    bgColor: bgColors[index]
  }));
};

const programColors = generateProgramColors();
const colorMap = new Map<string, { color: string; bgColor: string }>();

function getProgramColor(programId: string): { color: string; bgColor: string } {
  if (!colorMap.has(programId)) {
    const colorIndex = colorMap.size % programColors.length;
    colorMap.set(programId, programColors[colorIndex]);
  }
  return colorMap.get(programId)!;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slot: string } }
) {
  const client = getClickHouseClient();
  const slot = params.slot;

  try {
    // Get program invocation counts for this specific block
    const result = await client.query({
      query: `
        SELECT 
          program_id,
          count() as invocations
        FROM ${env.CLICKHOUSE_DB}.program_invocations
        WHERE slot = ${slot}
        GROUP BY program_id
        ORDER BY invocations DESC
      `,
      format: 'JSONEachRow',
    });

    const data = await result.json() as any[];
    let totalInvocations = 0;

    // Calculate total invocations for percentage calculation
    data.forEach((row: any) => {
      totalInvocations += parseInt(row.invocations);
    });

    // Convert to array with program names and calculate percentages
    const programStats = data.map((row: any) => {
      const { programInfo } = formatProgramDisplay(row.program_id);
      const colors = getProgramColor(row.program_id);
      const invocations = parseInt(row.invocations);
      
      return {
        program_id: row.program_id,
        name: programInfo.name,
        count: invocations,
        percentage: totalInvocations > 0 ? (invocations / totalInvocations) * 100 : 0,
        color: colors.color,
        bgColor: colors.bgColor
      };
    });

    return NextResponse.json(programStats);
  } catch (error) {
    console.error('Error fetching block program stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}