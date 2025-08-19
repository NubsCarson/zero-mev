import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { formatProgramDisplay } from '@/lib/programRegistry';
import { Connection, PublicKey } from '@solana/web3.js';

async function fetchRecentSlotsFromRPC(validatorAddress: string) {
  console.log(`[RPC] Starting RPC fetch for validator: ${validatorAddress}`);
  
  const rpcUrl = process.env.SOL_RPC || 'https://rpc.zeroblock.io';
  console.log(`[RPC] Using RPC URL: ${rpcUrl}`);
  
  const connection = new Connection(rpcUrl);
  
  try {
    // Get current slot
    console.log(`[RPC] Fetching current slot...`);
    const currentSlot = await connection.getSlot();
    console.log(`[RPC] Current slot: ${currentSlot}`);
    
    // Get leader schedule for current epoch
    console.log(`[RPC] Getting epoch schedule...`);
    const epochSchedule = await connection.getEpochSchedule();
    const currentEpoch = epochSchedule.getEpoch(currentSlot);
    console.log(`[RPC] Current epoch: ${currentEpoch}`);
    
    console.log(`[RPC] Fetching leader schedule for epoch ${currentEpoch}...`);
    const leaderSchedule = await connection.getLeaderSchedule();
    
    if (!leaderSchedule) {
      console.log(`[RPC] No leader schedule found`);
      return [];
    }
    
    console.log(`[RPC] Leader schedule has ${Object.keys(leaderSchedule).length} validators`);
    
    if (!leaderSchedule[validatorAddress]) {
      console.log(`[RPC] Validator ${validatorAddress} not found in leader schedule`);
      return [];
    }
    
    // Find the 10 most recent slots assigned to this validator
    const validatorSlots = leaderSchedule[validatorAddress] || [];
    console.log(`[RPC] Validator has ${validatorSlots.length} slots assigned in this epoch`);
    
    const firstSlotInEpoch = epochSchedule.getFirstSlotInEpoch(currentEpoch);
    console.log(`[RPC] First slot in epoch ${currentEpoch}: ${firstSlotInEpoch}`);
    
    // Convert relative slots to absolute slots and filter for recent ones
    const absoluteSlots = validatorSlots
      .map(relativeSlot => firstSlotInEpoch + relativeSlot)
      .filter(slot => slot <= currentSlot)
      .sort((a, b) => b - a) // Most recent first
      .slice(0, 10);
    
    console.log(`[RPC] Found ${absoluteSlots.length} recent slots for validator: ${absoluteSlots.join(', ')}`);
    
    const results = [];
    
    for (const slot of absoluteSlots) {
      try {
        console.log(`[RPC] Fetching block for slot ${slot}...`);
        const block = await connection.getBlock(slot, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (block) {
          console.log(`[RPC] Block ${slot} found with ${block.transactions.length} transactions`);
        } else {
          console.log(`[RPC] Block ${slot} not found (likely empty or skipped)`);
          continue;
        }
        
        if (block) {
          // Count program invocations
          const programCounts: { [program: string]: number } = {};
          let totalInvocations = 0;
          
          for (const tx of block.transactions) {
            const message = tx.transaction.message;
            const accountKeys = message.staticAccountKeys || [];
            
            // Process outer instructions - handle both legacy and versioned messages
            const instructions = 'instructions' in message ? message.instructions : message.compiledInstructions || [];
            if (instructions) {
              for (const instruction of instructions) {
                const programId = accountKeys[instruction.programIdIndex]?.toBase58();
                if (programId) {
                  programCounts[programId] = (programCounts[programId] || 0) + 1;
                  totalInvocations++;
                }
              }
            }
            
            // Process inner instructions
            if (tx.meta?.innerInstructions) {
              for (const inner of tx.meta.innerInstructions) {
                for (const instruction of inner.instructions) {
                  const programId = accountKeys[instruction.programIdIndex]?.toBase58();
                  if (programId) {
                    programCounts[programId] = (programCounts[programId] || 0) + 1;
                    totalInvocations++;
                  }
                }
              }
            }
          }
          
          const programs = Object.entries(programCounts)
            .map(([program_id, invocations]) => {
              const { programInfo } = formatProgramDisplay(program_id);
              return {
                program_id,
                name: programInfo.name,
                invocations
              };
            })
            .sort((a, b) => b.invocations - a.invocations);
          
          console.log(`[RPC] Block ${slot} processed: ${totalInvocations} invocations, ${programs.length} unique programs`);
          
          results.push({
            slot,
            block_time: block.blockTime ? new Date(block.blockTime * 1000).toISOString() : new Date().toISOString(),
            total_invocations: totalInvocations,
            unique_programs: programs.length,
            programs
          });
        }
      } catch (blockError) {
        console.error(`[RPC] Failed to fetch block ${slot}:`, blockError);
        // Continue with other slots
      }
    }
    
    console.log(`[RPC] Completed RPC fetch. Returning ${results.length} blocks`);
    return results;
  } catch (error) {
    console.error('[RPC] Error in fetchRecentSlotsFromRPC:', error);
    return [];
  }
}

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

    const countData = await countResult.json() as Array<{ total: string }>;
    const total = parseInt(countData[0]?.total || '0');
    console.log(`[DB] Count query result:`, countData, `total parsed as:`, total);

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

    const slotsData = await slotsResult.json() as Array<any>;

    console.log(`[DB] Found ${slotsData.length} slots in database, total: ${total}, offset: ${offset}`);

    // If no data in database and offset is 0, try to fetch from Solana RPC
    if (slotsData.length === 0 && offset === 0 && total === 0) {
      try {
        console.log(`No DB data for validator ${validator}, fetching from Solana RPC...`);
        const rpcSlots = await fetchRecentSlotsFromRPC(validator);
        return NextResponse.json({
          slots: rpcSlots,
          total: rpcSlots.length,
          source: 'rpc' // Indicate this came from RPC
        });
      } catch (rpcError) {
        console.error('Failed to fetch from RPC:', rpcError);
        // Continue with empty DB results
      }
    }

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
      total: total,
      source: 'database'
    });
  } catch (error) {
    console.error('Error fetching validator slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch validator slots', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}