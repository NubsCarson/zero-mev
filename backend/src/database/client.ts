import { createClient, ClickHouseClient } from '@clickhouse/client';
import { config } from '../config/index.js';

export class ClickHouseManager {
  private client: ClickHouseClient;

  constructor() {
    this.client = createClient({
      host: config.clickhouse.url,
      database: config.clickhouse.database,
      username: config.clickhouse.username,
      password: config.clickhouse.password,
    });
  }

  async initialize() {
    try {
      // Test connection
      await this.client.ping();
      console.log('✅ ClickHouse connection established');
      
      // Create database and tables if they don't exist
      await this.setupSchema();
    } catch (error) {
      console.error('❌ Failed to initialize ClickHouse:', error);
      throw error;
    }
  }

  private async setupSchema() {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const schemaPath = path.join(process.cwd(), 'src/database/schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf-8');
      
      // Split by semicolon and execute each statement
      const statements = schema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await this.client.exec({ query: statement });
        }
      }
      
      console.log('✅ Database schema initialized');
    } catch (error) {
      console.error('❌ Failed to setup schema:', error);
      throw error;
    }
  }

  async insertBlock(blockData: {
    slot: number;
    hash: string;
    parentHash: string;
    validatorIdentity: string;
    timestamp: Date;
    transactionCount: number;
    totalCuConsumed: number;
  }) {
    // Format timestamp for ClickHouse (remove milliseconds and Z suffix)
    const formattedTimestamp = blockData.timestamp.toISOString().replace(/\.\d{3}Z$/, '');
    
    await this.client.insert({
      table: 'blocks',
      values: [{
        slot: blockData.slot,
        hash: blockData.hash,
        parent_hash: blockData.parentHash,
        validator_identity: blockData.validatorIdentity,
        timestamp: formattedTimestamp,
        transaction_count: blockData.transactionCount,
        total_cu_consumed: blockData.totalCuConsumed,
      }],
      format: 'JSONEachRow',
    });
  }

  async insertProgramUsage(usageData: Array<{
    slot: number;
    validatorIdentity: string;
    programId: string;
    invocationCount: number;
    cuConsumed: number;
    timestamp: Date;
  }>) {
    if (usageData.length === 0) return;

    await this.client.insert({
      table: 'program_usage',
      values: usageData.map(data => ({
        slot: data.slot,
        validator_identity: data.validatorIdentity,
        program_id: data.programId,
        invocation_count: data.invocationCount,
        cu_consumed: Math.round(data.cuConsumed),
        timestamp: data.timestamp.toISOString().replace(/\.\d{3}Z$/, ''),
      })),
      format: 'JSONEachRow',
    });
  }

  async getValidatorStats(validatorIdentity: string, timeRange: { start: Date; end: Date }) {
    const result = await this.client.query({
      query: `
        SELECT 
          validator_identity,
          count(DISTINCT slot) as blocks_produced,
          sum(transaction_count) as total_transactions,
          sum(total_cu_consumed) as total_cu_consumed,
          avg(transaction_count) as avg_transactions_per_block
        FROM blocks 
        WHERE validator_identity = {validator_identity:String}
          AND timestamp >= {start:DateTime64}
          AND timestamp <= {end:DateTime64}
        GROUP BY validator_identity
      `,
      query_params: {
        validator_identity: validatorIdentity,
        start: timeRange.start,
        end: timeRange.end,
      },
    });

    return await result.json();
  }

  async getValidatorProgramUsage(validatorIdentity: string, timeRange: { start: Date; end: Date }) {
    const result = await this.client.query({
      query: `
        SELECT 
          pu.program_id,
          p.name as program_name,
          p.category,
          sum(pu.invocation_count) as total_invocations,
          sum(pu.cu_consumed) as total_cu_consumed,
          count(DISTINCT pu.slot) as blocks_used
        FROM program_usage pu
        LEFT JOIN programs p ON pu.program_id = p.program_id
        WHERE pu.validator_identity = {validator_identity:String}
          AND pu.timestamp >= {start:DateTime64}
          AND pu.timestamp <= {end:DateTime64}
        GROUP BY pu.program_id, p.name, p.category
        ORDER BY total_invocations DESC
      `,
      query_params: {
        validator_identity: validatorIdentity,
        start: timeRange.start,
        end: timeRange.end,
      },
    });

    return await result.json();
  }

  async getTopValidators(timeRange: { start: Date; end: Date }, limit: number = 50) {
    const result = await this.client.query({
      query: `
        SELECT 
          validator_identity,
          count(DISTINCT slot) as blocks_produced,
          sum(transaction_count) as total_transactions,
          sum(total_cu_consumed) as total_cu_consumed
        FROM blocks 
        WHERE timestamp >= {start:DateTime64}
          AND timestamp <= {end:DateTime64}
        GROUP BY validator_identity
        ORDER BY blocks_produced DESC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        start: timeRange.start,
        end: timeRange.end,
        limit,
      },
    });

    return await result.json();
  }

  async searchValidators(query: string, limit: number = 20) {
    const result = await this.client.query({
      query: `
        SELECT DISTINCT validator_identity,
               count() as blocks_produced
        FROM blocks 
        WHERE validator_identity LIKE {query:String}
        GROUP BY validator_identity
        ORDER BY blocks_produced DESC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        query: `%${query}%`,
        limit,
      },
    });

    return await result.json();
  }

  async close() {
    await this.client.close();
  }
}

export const clickHouseManager = new ClickHouseManager();