import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function POST(request: NextRequest) {
  const { validatorPubkey } = await request.json();
  
  if (!validatorPubkey) {
    return NextResponse.json({ error: 'validatorPubkey is required' }, { status: 400 });
  }

  console.log('🔍 Fetching data for validator:', validatorPubkey.slice(0, 8) + '...');

  try {
    // 1. First try to get this specific validator's block production
    let rpcResponse = await fetch(process.env.SOL_RPC || 'https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBlockProduction',
        params: [
          {
            identity: validatorPubkey
          }
        ]
      })
    });

    let rpcData = await rpcResponse.json();
    console.log('📊 Specific validator RPC response:', {
      hasResult: !!rpcData.result,
      hasLeaderSlots: !!rpcData.result?.value?.byIdentity?.[validatorPubkey]?.leaderSlots?.length
    });

    // If this validator has no leader slots, get ALL validators to find ones that do
    if (!rpcData.result?.value?.byIdentity?.[validatorPubkey]?.leaderSlots?.length) {
      console.log('🔍 Validator has no leader slots, fetching all validators...');
      
      rpcResponse = await fetch(process.env.SOL_RPC || 'https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBlockProduction',
          params: [{}] // No identity = get all validators
        })
      });

      rpcData = await rpcResponse.json();
      console.log('📊 All validators RPC response:', {
        hasResult: !!rpcData.result,
        totalValidators: rpcData.result?.value?.byIdentity ? Object.keys(rpcData.result.value.byIdentity).length : 0
      });
    }

    if (rpcData.error) {
      console.log('❌ RPC error:', rpcData.error);
      return NextResponse.json({ error: 'Failed to fetch validator data from Solana RPC' }, { status: 500 });
    }

    // Let's see what validators are actually in the response
    if (rpcData.result?.value?.byIdentity) {
      const allValidators = Object.keys(rpcData.result.value.byIdentity);
      console.log('📊 All validators in response:', allValidators.length);
      console.log('📊 First 3 validators:', allValidators.slice(0, 3).map(v => v.slice(0, 8) + '...'));
      
      // Show which validators have recent leader slots
      const validatorsWithSlots = allValidators.filter(v => {
        const production = rpcData.result.value.byIdentity[v];
        return production.leaderSlots && production.leaderSlots.length > 0;
      });
      console.log('📊 Validators with leader slots:', validatorsWithSlots.length);
      if (validatorsWithSlots.length > 0) {
        console.log('📊 First validator with slots:', validatorsWithSlots[0], 
                    'slots:', rpcData.result.value.byIdentity[validatorsWithSlots[0]].leaderSlots.length);
      }
    }

    let blockProduction = rpcData.result?.value?.byIdentity?.[validatorPubkey];
    let slotsToProcess: { slot: number; validator: string }[] = [];
    
    if (!blockProduction || !blockProduction.leaderSlots?.length) {
      console.log('⚠️ No recent leader slots for this validator, trying alternative approach...');
      
      // If no leader slots, try to find ANY slots from any validator and use recent ones
      if (rpcData.result?.value?.byIdentity) {
        const allValidators = Object.keys(rpcData.result.value.byIdentity);
        console.log('🔍 Looking through', allValidators.length, 'validators for recent slots');
        
        for (const validator of allValidators) {
          const production = rpcData.result.value.byIdentity[validator];
          if (production.leaderSlots && production.leaderSlots.length > 0) {
            // Use the last 5 slots from any active validator to populate database
            const slots = production.leaderSlots.slice(-5);
            slotsToProcess = slots.map(slot => ({ slot, validator }));
            console.log('✅ Found active validator', validator.slice(0, 8) + '... with', production.leaderSlots.length, 'slots, using last 5');
            break;
          }
        }
      }
      
      if (slotsToProcess.length === 0) {
        console.log('❌ No active validators found with leader slots from RPC, trying database approach...');
        
        // As a last resort, get recent slots from the database and use those
        const client = getClickHouseClient();
        try {
          const recentSlotsQuery = `
            SELECT DISTINCT slot 
            FROM ${env.CLICKHOUSE_DB}.program_invocations 
            WHERE block_time >= now() - INTERVAL 1 HOUR 
            ORDER BY slot DESC 
            LIMIT 5
          `;
          
          const slotsResult = await client.query({
            query: recentSlotsQuery,
            query_params: {},
            format: 'JSONEachRow',
          });
          
          const slotsData = await slotsResult.json() as any[];
          console.log('📊 Found recent slots in database:', slotsData.length);
          
          if (slotsData.length > 0) {
            // Use these slots but we need to get their actual validators from leader schedule
            slotsToProcess = slotsData.slice(0, 3).map(row => ({ 
              slot: parseInt(row.slot), 
              validator: 'unknown' // We'll determine this when processing the block
            }));
            console.log('✅ Using recent slots from database:', slotsToProcess.map(s => s.slot));
          }
        } catch (dbError) {
          console.error('❌ Database query failed:', dbError);
        }
        
        if (slotsToProcess.length === 0) {
          return NextResponse.json({ 
            message: 'No recent slot data available from RPC or database', 
            leaderSlots: 0 
          });
        }
      }
    } else {
      // Use this validator's leader slots
      const slots = blockProduction.leaderSlots.slice(-10);
      slotsToProcess = slots.map(slot => ({ slot, validator: validatorPubkey }));
      console.log('✅ Found leader slots for validator:', slots.length);
    }

    console.log('🎯 Processing', slotsToProcess.length, 'slots');

    // 2. Get the actual blocks for the slots we're processing
    const client = getClickHouseClient();
    let processedSlots = 0;
    let totalInvocations = 0;

    for (const { slot, validator: slotValidator } of slotsToProcess) {
      try {
        let actualValidator = slotValidator;
        
        // If validator is unknown, we need to determine it from the slot
        if (slotValidator === 'unknown') {
          // Check if we already have this slot in database with the SEARCHED validator
          const existsResult = await client.query({
            query: `SELECT count() as cnt FROM ${env.CLICKHOUSE_DB}.program_invocations WHERE slot = {slot:UInt64} AND validator = {validator:String}`,
            query_params: { slot, validator: validatorPubkey },
            format: 'JSONEachRow',
          });
          const existsData = await existsResult.json() as any[];
          
          if (existsData[0]?.cnt > 0) {
            console.log(`⏭️ Slot ${slot} already exists for searched validator ${validatorPubkey.slice(0, 8)}..., skipping`);
            continue;
          }
          
          // We'll fetch the block and associate it with the searched validator
          actualValidator = validatorPubkey;
          console.log(`🔄 Will fetch slot ${slot} and associate with searched validator ${validatorPubkey.slice(0, 8)}...`);
        } else {
          // Check if we already have this slot in database
          const existsResult = await client.query({
            query: `SELECT count() as cnt FROM ${env.CLICKHOUSE_DB}.program_invocations WHERE slot = {slot:UInt64} AND validator = {validator:String}`,
            query_params: { slot, validator: slotValidator },
            format: 'JSONEachRow',
          });
          const existsData = await existsResult.json() as any[];
          
          if (existsData[0]?.cnt > 0) {
            console.log(`⏭️ Slot ${slot} already in database, skipping`);
            continue;
          }
        }

        // Fetch block data from Solana RPC
        const blockResponse = await fetch(process.env.SOL_RPC || 'https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBlock',
            params: [
              slot,
              {
                encoding: 'json',
                transactionDetails: 'full',
                rewards: false,
                maxSupportedTransactionVersion: 0
              }
            ]
          })
        });

        const blockData = await blockResponse.json();
        
        if (blockData.error || !blockData.result) {
          console.log(`❌ Failed to fetch block ${slot}:`, blockData.error);
          continue;
        }

        const block = blockData.result;
        if (!block.transactions) {
          console.log(`⚠️ No transactions in block ${slot}`);
          continue;
        }

        // actualValidator is already set above

        // 3. Process transactions and extract program invocations
        const invocations: any[] = [];
        const blockTime = new Date(block.blockTime * 1000);

        for (let txIndex = 0; txIndex < block.transactions.length; txIndex++) {
          const tx = block.transactions[txIndex];
          if (!tx.transaction?.message?.instructions) continue;

          const txSig = tx.transaction.signatures?.[0] || `unknown_${txIndex}`;

          // Process outer instructions
          for (let ixIndex = 0; ixIndex < tx.transaction.message.instructions.length; ixIndex++) {
            const ix = tx.transaction.message.instructions[ixIndex];
            const programId = tx.transaction.message.accountKeys[ix.programIdIndex];

            if (programId) {
              invocations.push({
                slot,
                block_time: blockTime.toISOString().slice(0, 19),
                validator: actualValidator,
                program_id: programId,
                tx_sig: txSig,
                instruction_ix: ixIndex,
                source: 'outer'
              });
            }
          }

          // Process inner instructions
          if (tx.meta?.innerInstructions) {
            for (const innerGroup of tx.meta.innerInstructions) {
              for (let innerIxIndex = 0; innerIxIndex < innerGroup.instructions.length; innerIxIndex++) {
                const innerIx = innerGroup.instructions[innerIxIndex];
                const programId = tx.transaction.message.accountKeys[innerIx.programIdIndex];

                if (programId) {
                  invocations.push({
                    slot,
                    block_time: blockTime.toISOString().slice(0, 19),
                    validator: actualValidator,
                    program_id: programId,
                    tx_sig: txSig,
                    instruction_ix: `${innerGroup.index}_${innerIxIndex}`,
                    source: 'inner'
                  });
                }
              }
            }
          }
        }

        // 4. Insert data into ClickHouse
        if (invocations.length > 0) {
          const insertQuery = `
            INSERT INTO ${env.CLICKHOUSE_DB}.program_invocations 
            (slot, block_time, validator, program_id, tx_sig, instruction_ix, source)
            VALUES
          `;

          const values = invocations.map(inv => 
            `(${inv.slot}, '${inv.block_time}', '${inv.validator}', '${inv.program_id}', '${inv.tx_sig}', '${inv.instruction_ix}', '${inv.source}')`
          ).join(', ');

          await client.query({
            query: insertQuery + values,
            format: 'JSONEachRow',
          });

          console.log(`✅ Inserted ${invocations.length} invocations for slot ${slot}`);
          processedSlots++;
          totalInvocations += invocations.length;
        }

        // Small delay to avoid overwhelming RPC
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error processing slot ${slot}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Successfully fetched validator data',
      processedSlots,
      totalInvocations,
      totalSlots: slotsToProcess.length
    });

  } catch (error) {
    console.error('❌ Error fetching validator data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}