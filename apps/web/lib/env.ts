import { z } from 'zod';

const envSchema = z.object({
  CLICKHOUSE_URL: z.string().default('http://localhost:8123'),
  CLICKHOUSE_USER: z.string().default('default'),
  CLICKHOUSE_PASS: z.string().optional().default(''),
  CLICKHOUSE_DB: z.string().default('solana'),
});

export const env = envSchema.parse(process.env);