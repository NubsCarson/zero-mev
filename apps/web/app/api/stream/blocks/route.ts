import { NextRequest } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      console.log('🚀 SSE blocks stream started');
      
      const sendData = async () => {
        try {
          const client = getClickHouseClient();
          
          const query = `
            SELECT 
              slot,
              formatDateTime(block_time, '%Y-%m-%dT%H:%M:%SZ', 'UTC') as block_time,
              validator,
              count() as total_invocations,
              countDistinct(program_id) as unique_programs,
              countDistinct(tx_sig) as unique_transactions
            FROM ${env.CLICKHOUSE_DB}.program_invocations
            WHERE slot >= (SELECT max(slot) - 20 FROM ${env.CLICKHOUSE_DB}.program_invocations)
            GROUP BY slot, block_time, validator
            ORDER BY slot DESC
            LIMIT 20
          `;
          
          const result = await client.query({
            query,
            format: 'JSONEachRow',
          });
          
          const data = await result.json();
          console.log(`📊 SSE blocks: sending ${data.length} blocks`);
          
          const sseData = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          
        } catch (error) {
          console.error('SSE blocks error:', error);
          const errorData = `data: ${JSON.stringify({ error: 'Failed to fetch blocks', details: error.message })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
        }
      };
      
      // Send initial data
      sendData();
      
      // Send data every 500ms for real-time updates
      const interval = setInterval(sendData, 500);
      
      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}