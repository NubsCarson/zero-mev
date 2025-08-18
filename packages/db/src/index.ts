export { getClickHouseClient, closeClickHouseClient } from './client';
export { env } from './env';

export interface ProgramInvocation {
  slot: number;
  block_time: Date;
  validator: string;
  program_id: string;
  tx_sig: string;
  instruction_ix: number;
  source: 'outer' | 'inner';
}

export interface ProgramBlacklist {
  program_id: string;
  reason: string;
  added_at?: Date;
}

export interface InvocationHour {
  ts_hour: Date;
  validator: string;
  program_id: string;
  cnt: number;
}