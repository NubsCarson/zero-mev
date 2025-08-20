import dotenv from 'dotenv';

dotenv.config();

export const config = {
  yellowstone: {
    grpcUrl: process.env.YELLOWSTONE_GRPC_URL || 'https://your-yellowstone-endpoint.com',
    apiToken: process.env.YELLOWSTONE_API_TOKEN || '',
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB || 'validator_analytics',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASS || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3001'),
  },
};