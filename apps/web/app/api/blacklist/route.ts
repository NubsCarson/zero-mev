import { NextRequest, NextResponse } from 'next/server';
import { getClickHouseClient } from '../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET() {
  console.log('📋 Backend: GET blacklist request received');
  const client = getClickHouseClient();

  try {
    const query = `
      SELECT 
        program_id,
        reason,
        added_at
      FROM ${env.CLICKHOUSE_DB}.program_blacklist
      FINAL
      WHERE reason != ''
      ORDER BY added_at DESC
    `;
    console.log('🔍 Backend: Executing query:', query);
    
    const result = await client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json();
    console.log('📊 Backend: GET blacklist returned', data.length, 'entries:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('💥 Backend: Error fetching blacklist:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const client = getClickHouseClient();

  try {
    const body = await request.json();
    const { program_id, reason } = body;

    if (!program_id || !reason) {
      return NextResponse.json(
        { error: 'program_id and reason are required' },
        { status: 400 }
      );
    }

    await client.insert({
      table: `${env.CLICKHOUSE_DB}.program_blacklist`,
      values: [{ program_id, reason }],
      format: 'JSONEachRow',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding to blacklist:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  console.log('🗑️ Backend: DELETE request received');
  const client = getClickHouseClient();

  try {
    const body = await request.json();
    console.log('📝 Backend: Request body received:', body);
    const { program_id } = body;

    if (!program_id) {
      console.log('❌ Backend: Missing program_id in request');
      return NextResponse.json(
        { error: 'program_id is required' },
        { status: 400 }
      );
    }

    console.log('🎯 Backend: Attempting to remove program_id:', program_id);

    // Check current state before deletion
    const beforeQuery = await client.query({
      query: `SELECT program_id, reason, added_at FROM ${env.CLICKHOUSE_DB}.program_blacklist WHERE program_id = {program_id:String} ORDER BY added_at DESC`,
      query_params: { program_id },
      format: 'JSONEachRow',
    });
    const beforeData = await beforeQuery.json();
    console.log('📊 Backend: ALL entries for this program before deletion:', beforeData);

    // Instead of using ReplacingMergeTree deletion, let's use ALTER TABLE DELETE
    // This is more reliable for immediate deletion
    try {
      console.log('🗑️ Backend: Using ALTER TABLE DELETE for immediate removal...');
      await client.query({
        query: `ALTER TABLE ${env.CLICKHOUSE_DB}.program_blacklist DELETE WHERE program_id = {program_id:String}`,
        query_params: { program_id },
      });
      console.log('✅ Backend: ALTER TABLE DELETE completed');
    } catch (alterError) {
      console.warn('⚠️ Backend: ALTER TABLE DELETE failed, falling back to ReplacingMergeTree method:', alterError);
      
      // Fallback to ReplacingMergeTree method
      const deleteRecord = { program_id, reason: '', added_at: new Date() };
      console.log('💾 Backend: Inserting deletion record:', deleteRecord);
      
      await client.insert({
        table: `${env.CLICKHOUSE_DB}.program_blacklist`,
        values: [deleteRecord],
        format: 'JSONEachRow',
      });
      console.log('✅ Backend: Deletion record inserted successfully');

      // Force optimize table to merge data immediately
      try {
        console.log('🔄 Backend: Optimizing table to force merge...');
        await client.query({
          query: `OPTIMIZE TABLE ${env.CLICKHOUSE_DB}.program_blacklist FINAL`,
        });
        console.log('✅ Backend: Table optimization completed');
      } catch (optimizeError) {
        console.warn('⚠️ Backend: Failed to optimize table:', optimizeError);
      }
    }

    // Wait a moment for changes to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check state after deletion
    const afterQuery = await client.query({
      query: `SELECT program_id, reason, added_at FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL WHERE program_id = {program_id:String} AND reason != ''`,
      query_params: { program_id },
      format: 'JSONEachRow',
    });
    const afterData = await afterQuery.json();
    console.log('📊 Backend: Active blacklist entries after deletion:', afterData);

    console.log('🎉 Backend: DELETE operation completed successfully');
    return NextResponse.json({ 
      success: true, 
      beforeCount: beforeData.filter(e => e.reason !== '').length, 
      afterCount: afterData.length 
    });
  } catch (error) {
    console.error('💥 Backend: Error removing from blacklist:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}