import { NextRequest } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(request.url);
  
  const programId = searchParams.get('programId');
  const validator = searchParams.get('validator') || 'all';
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('Z', '');
  const to = searchParams.get('to') || new Date().toISOString().replace('Z', '');
  
  if (!programId) {
    return new Response('Missing programId parameter', { status: 400 });
  }
  
  const stream = new ReadableStream({
    start(controller) {
      const sendData = async () => {
        try {
          const client = getClickHouseClient();
          
          let query = `
            SELECT 
              ts_hour as ts,
              sum(cnt) as cnt
            FROM ${env.CLICKHOUSE_DB}.invocations_hour
          `;

          const conditions: string[] = [];
          const queryParams: any = { programId };

          conditions.push('program_id = {programId:String}');
          conditions.push('ts_hour >= {from:DateTime}');
          queryParams.from = from.replace('Z', '');

          conditions.push('ts_hour <= {to:DateTime}');
          queryParams.to = to.replace('Z', '');

          if (validator !== 'all') {
            conditions.push('validator = {validator:String}');
            queryParams.validator = validator;
          }

          query += ` WHERE ${conditions.join(' AND ')} GROUP BY ts_hour ORDER BY ts_hour ASC`;
          
          const result = await client.query({
            query,
            query_params: queryParams,
            format: 'JSONEachRow',
          });
          
          const data = await result.json();
          
          const sseData = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          
        } catch (error) {
          console.error('SSE program-stats error:', error);
          const errorData = `data: ${JSON.stringify({ error: 'Failed to fetch program stats' })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
        }
      };
      
      // Send initial data
      sendData();
      
      // Send data every 3 seconds for program stats
      const interval = setInterval(sendData, 3000);
      
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