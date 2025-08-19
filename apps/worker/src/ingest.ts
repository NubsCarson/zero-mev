import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import { getClickHouseClient, ProgramInvocation } from '../../../packages/db/src';
import pLimit from 'p-limit';
import { env } from './env';
import { logger } from './logger';

interface LeaderScheduleCache {
  [epoch: number]: Map<number, string>;
}

class SolanaIngester {
  private connection: Connection;
  private client: ReturnType<typeof getClickHouseClient>;
  private leaderCache: LeaderScheduleCache = {};
  private lastProcessedSlot: number = 0;
  private isRunning: boolean = false;

  constructor() {
    this.connection = new Connection(env.SOL_RPC, env.INGEST_COMMITMENT as Commitment);
    this.client = getClickHouseClient();
  }

  async start() {
    this.isRunning = true;
    logger.info('Starting Solana ingestion worker...');
    
    try {
      await this.backfill();
      await this.startRealtime();
    } catch (error) {
      logger.error('Fatal error in ingester:', error);
      process.exit(1);
    }
  }

  private async getLeaderForSlot(slot: number): Promise<string> {
    const epochSchedule = await this.connection.getEpochSchedule();
    const epoch = epochSchedule.getEpoch(slot);
    
    if (!this.leaderCache[epoch]) {
      logger.info(`Fetching leader schedule for epoch ${epoch}`);
      try {
        const schedule = await this.connection.getLeaderSchedule();
        const scheduleMap = new Map<number, string>();
        
        logger.debug(`Leader schedule for epoch ${epoch}: ${Object.keys(schedule || {}).length} validators`);
        
        if (schedule) {
          for (const [validator, slots] of Object.entries(schedule)) {
            for (const s of slots) {
              scheduleMap.set(s, validator);
            }
          }
        }
        
        logger.debug(`Cached ${scheduleMap.size} slot assignments for epoch ${epoch}`);
        this.leaderCache[epoch] = scheduleMap;
      } catch (error) {
        logger.warn(`Failed to fetch leader schedule for epoch ${epoch}:`, error);
        return 'unknown';
      }
    }
    
    const slotInEpoch = slot - epochSchedule.getFirstSlotInEpoch(epoch);
    const validator = this.leaderCache[epoch].get(slotInEpoch) || 'unknown';
    if (validator === 'unknown') {
      logger.debug(`No validator found for slot ${slot} (slot-in-epoch: ${slotInEpoch}) in epoch ${epoch} (cache has ${this.leaderCache[epoch].size} entries)`);
    }
    return validator;
  }

  private async processSlot(slot: number): Promise<void> {
    try {
      const block = await this.connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        commitment: env.INGEST_COMMITMENT as Commitment,
      });

      if (!block) {
        logger.debug(`No block found for slot ${slot}`);
        return;
      }

      const validator = await this.getLeaderForSlot(slot);
      const blockTime = block.blockTime ? new Date(block.blockTime * 1000) : new Date();
      const invocations: ProgramInvocation[] = [];

      for (const tx of block.transactions) {
        const txSig = tx.transaction.signatures[0];
        const message = tx.transaction.message;
        const accountKeys = message.staticAccountKeys || [];

        // Process outer instructions
        if (message.instructions) {
          for (let ix = 0; ix < message.instructions.length; ix++) {
            const instruction = message.instructions[ix];
            const programId = accountKeys[instruction.programIdIndex]?.toBase58();
          
          if (programId) {
            invocations.push({
              slot,
              block_time: blockTime,
              validator,
              program_id: programId,
              tx_sig: txSig,
              instruction_ix: ix,
              source: 'outer',
            });
          }
          }
        }

        // Process inner instructions
        if (tx.meta?.innerInstructions) {
          for (const innerGroup of tx.meta.innerInstructions) {
            for (const innerIx of innerGroup.instructions) {
              const programId = accountKeys[innerIx.programIdIndex]?.toBase58();
              
              if (programId) {
                invocations.push({
                  slot,
                  block_time: blockTime,
                  validator,
                  program_id: programId,
                  tx_sig: txSig,
                  instruction_ix: innerGroup.index,
                  source: 'inner',
                });
              }
            }
          }
        }
      }

      if (invocations.length > 0) {
        await this.insertInvocations(invocations);
        logger.debug(`Processed slot ${slot}: ${invocations.length} invocations`);
      }
    } catch (error) {
      logger.error(`Failed to process slot ${slot}:`, error);
    }
  }

  private async insertInvocations(invocations: ProgramInvocation[]): Promise<void> {
    try {
      const values = invocations.map(inv => ({
        slot: inv.slot,
        block_time: Math.floor(inv.block_time.getTime() / 1000),
        validator: inv.validator,
        program_id: inv.program_id,
        tx_sig: inv.tx_sig,
        instruction_ix: inv.instruction_ix,
        source: inv.source,
      }));

      await this.client.insert({
        table: `${env.CLICKHOUSE_DB}.program_invocations`,
        values,
        format: 'JSONEachRow',
      });
    } catch (error) {
      logger.error('Failed to insert invocations:', error);
    }
  }

  private async backfill(): Promise<void> {
    logger.info('Starting backfill process...');
    
    const currentSlot = await this.connection.getSlot(env.INGEST_COMMITMENT as Commitment);
    const fromSlot = Math.max(0, currentSlot - env.INGEST_BACKFILL_SLOTS);
    
    logger.info(`Backfilling slots ${fromSlot} to ${currentSlot}`);
    
    const limit = pLimit(env.INGEST_CONCURRENCY);
    const slots = [];
    
    for (let slot = fromSlot; slot <= currentSlot; slot++) {
      slots.push(slot);
    }
    
    const promises = slots.map(slot => 
      limit(() => this.processSlot(slot))
    );
    
    await Promise.all(promises);
    
    this.lastProcessedSlot = currentSlot;
    logger.info('Backfill completed');
  }

  private async startRealtime(): Promise<void> {
    logger.info('Starting realtime ingestion...');
    
    while (this.isRunning) {
      try {
        const currentSlot = await this.connection.getSlot(env.INGEST_COMMITMENT as Commitment);
        
        if (currentSlot > this.lastProcessedSlot) {
          const slotsToProcess = [];
          for (let slot = this.lastProcessedSlot + 1; slot <= currentSlot; slot++) {
            slotsToProcess.push(slot);
          }
          
          const limit = pLimit(env.INGEST_CONCURRENCY);
          const promises = slotsToProcess.map(slot => 
            limit(() => this.processSlot(slot))
          );
          
          await Promise.all(promises);
          this.lastProcessedSlot = currentSlot;
          
          logger.debug(`Processed up to slot ${currentSlot}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        logger.error('Error in realtime ingestion:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async stop() {
    this.isRunning = false;
    await this.client.close();
    logger.info('Ingestion worker stopped');
  }
}

async function main() {
  const ingester = new SolanaIngester();
  
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await ingester.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await ingester.stop();
    process.exit(0);
  });
  
  await ingester.start();
}

if (require.main === module) {
  main().catch(error => {
    logger.error('Failed to start ingester:', error);
    process.exit(1);
  });
}