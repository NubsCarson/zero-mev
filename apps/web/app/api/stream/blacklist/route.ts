import { NextRequest } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      const sendData = async () => {
        try {
          const client = getClickHouseClient();
          
          const query = `
            SELECT 
              program_id,
              reason,
              added_at
            FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL 
            WHERE reason != ''
            ORDER BY added_at DESC
          `;
          
          const result = await client.query({
            query,
            format: 'JSONEachRow',
          });
          
          const data = await result.json() as any[];
          
          const sseData = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          
        } catch (error) {
          console.error('SSE blacklist error:', error);
          const errorData = `data: ${JSON.stringify({ error: 'Failed to fetch blacklist' })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
        }
      };
      
      // Send initial data
      sendData();
      
      // Send data every 5 seconds for blacklist updates
      const interval = setInterval(sendData, 5000);
      
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