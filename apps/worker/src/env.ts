import { z } from 'zod';

const envSchema = z.object({
  SOL_RPC: z.string().url(),
  CLICKHOUSE_URL: z.string().default('http://localhost:8123'),
  CLICKHOUSE_USER: z.string().default('default'),
  CLICKHOUSE_PASS: z.string().optional().default(''),
  CLICKHOUSE_DB: z.string().default('solana'),
  INGEST_BACKFILL_SLOTS: z.coerce.number().default(20000),
  INGEST_COMMITMENT: z.enum(['processed', 'confirmed', 'finalized']).default('confirmed'),
  INGEST_CONCURRENCY: z.coerce.number().default(8),
});

export const env = envSchema.parse(process.env);