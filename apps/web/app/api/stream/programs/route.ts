import { NextRequest } from 'next/server';
import { getClickHouseClient } from '../../../../../../packages/db/src';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(request.url);
  
  const validator = searchParams.get('validator') || 'all';
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('Z', '');
  const to = searchParams.get('to') || new Date().toISOString().replace('Z', '');
  const excludeBlacklisted = searchParams.get('excludeBlacklisted') === 'true';
  
  const stream = new ReadableStream({
    start(controller) {
      const sendData = async () => {
        try {
          const client = getClickHouseClient();
          
          let query = `
            SELECT 
              program_id,
              sum(cnt) as cnt
            FROM ${env.CLICKHOUSE_DB}.invocations_hour
          `;

          const conditions: string[] = [];
          const queryParams: any = { limit: 50 };

          conditions.push('ts_hour >= {from:DateTime}');
          queryParams.from = from.replace('Z', '');

          conditions.push('ts_hour <= {to:DateTime}');
          queryParams.to = to.replace('Z', '');

          if (validator !== 'all') {
            conditions.push('validator = {validator:String}');
            queryParams.validator = validator;
          }

          if (excludeBlacklisted) {
            const blacklistCheck = await client.query({
              query: `SELECT count() FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL WHERE reason != ''`,
              format: 'JSONEachRow',
            });
            const blacklistData = await blacklistCheck.json();
            const hasBlacklist = blacklistData[0]?.['count()'] > 0;
            
            if (hasBlacklist) {
              conditions.push(`program_id NOT IN (SELECT program_id FROM ${env.CLICKHOUSE_DB}.program_blacklist FINAL WHERE reason != '')`);
            }
          }

          if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
          }

          query += ` GROUP BY program_id ORDER BY cnt DESC LIMIT {limit:UInt32}`;
          
          const result = await client.query({
            query,
            query_params: queryParams,
            format: 'JSONEachRow',
          });
          
          const data = await result.json();
          
          const sseData = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          
        } catch (error) {
          console.error('SSE programs error:', error);
          const errorData = `data: ${JSON.stringify({ error: 'Failed to fetch programs' })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
        }
      };
      
      // Send initial data
      sendData();
      
      // Send data every 2 seconds for real-time updates
      const interval = setInterval(sendData, 2000);
      
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