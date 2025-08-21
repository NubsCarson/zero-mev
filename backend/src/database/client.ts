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

  // Wallet-related methods
  async insertWalletTransaction(txData: {
    signature: string;
    walletAddress: string;
    slot: number;
    blockTime: Date;
    fee: number;
    status: string;
    computeUnitsConsumed: number;
    programsInvoked: string[];
    transactionType: string;
    amount: number | null;
  }) {
    const formattedTimestamp = txData.blockTime.toISOString().replace(/\.\d{3}Z$/, '');
    
    await this.client.insert({
      table: 'wallet_transactions',
      values: [{
        signature: txData.signature,
        wallet_address: txData.walletAddress,
        slot: txData.slot,
        block_time: formattedTimestamp,
        fee: txData.fee,
        status: txData.status,
        compute_units_consumed: txData.computeUnitsConsumed,
        programs_invoked: txData.programsInvoked,
        transaction_type: txData.transactionType,
        amount: txData.amount,
      }],
      format: 'JSONEachRow',
    });
  }

  async insertWalletProgramUsage(usageData: Array<{
    walletAddress: string;
    programId: string;
    invocationCount: number;
    cuConsumed: number;
    transactionCount: number;
    timestamp: Date;
  }>) {
    if (usageData.length === 0) return;

    await this.client.insert({
      table: 'wallet_program_usage',
      values: usageData.map(data => ({
        wallet_address: data.walletAddress,
        program_id: data.programId,
        invocation_count: data.invocationCount,
        cu_consumed: Math.round(data.cuConsumed),
        transaction_count: data.transactionCount,
        last_used: data.timestamp.toISOString().replace(/\.\d{3}Z$/, ''),
        time_period: '24h', // Default to 24h for now
      })),
      format: 'JSONEachRow',
    });
  }

  async insertWalletStats(stats: {
    walletAddress: string;
    totalTransactions: number;
    totalCuConsumed: number;
    uniqueProgramsUsed: number;
    totalFeesPaid: number;
    firstTransaction: Date;
    lastTransaction: Date;
    timePeriod: string;
  }) {
    await this.client.insert({
      table: 'wallet_stats',
      values: [{
        wallet_address: stats.walletAddress,
        total_transactions: stats.totalTransactions,
        total_cu_consumed: stats.totalCuConsumed,
        unique_programs_used: stats.uniqueProgramsUsed,
        total_fees_paid: stats.totalFeesPaid,
        first_transaction: stats.firstTransaction.toISOString().replace(/\.\d{3}Z$/, ''),
        last_transaction: stats.lastTransaction.toISOString().replace(/\.\d{3}Z$/, ''),
        time_period: stats.timePeriod,
      }],
      format: 'JSONEachRow',
    });
  }

  async searchWallets(query: string, limit: number = 20) {
    const result = await this.client.query({
      query: `
        SELECT DISTINCT wallet_address,
               count() as transaction_count
        FROM wallet_transactions 
        WHERE wallet_address LIKE {query:String}
        GROUP BY wallet_address
        ORDER BY transaction_count DESC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        query: `%${query}%`,
        limit,
      },
    });

    return await result.json();
  }

  async getWalletStats(walletAddress: string, timeRange: string) {
    const timeFilter = this.getTimeRangeFilter(timeRange);
    
    const result = await this.client.query({
      query: `
        SELECT 
          wallet_address,
          count(DISTINCT signature) as total_transactions,
          sum(compute_units_consumed) as total_cu_consumed,
          uniqExact(arrayJoin(programs_invoked)) as unique_programs_used,
          sum(fee) as total_fees_paid,
          min(block_time) as first_transaction,
          max(block_time) as last_transaction
        FROM wallet_transactions 
        WHERE wallet_address = {wallet_address:String}
          AND block_time >= {start:DateTime64}
        GROUP BY wallet_address
      `,
      query_params: {
        wallet_address: walletAddress,
        start: timeFilter.start,
      },
    });

    return await result.json();
  }

  async getWalletProgramUsage(walletAddress: string, timeRange: string) {
    const timeFilter = this.getTimeRangeFilter(timeRange);
    
    const result = await this.client.query({
      query: `
        SELECT 
          arrayJoin(programs_invoked) as program_id,
          count() as total_invocations,
          sum(compute_units_consumed) as total_cu_consumed,
          count(DISTINCT signature) as transaction_count
        FROM wallet_transactions
        WHERE wallet_address = {wallet_address:String}
          AND block_time >= {start:DateTime64}
        GROUP BY program_id
        ORDER BY total_invocations DESC
      `,
      query_params: {
        wallet_address: walletAddress,
        start: timeFilter.start,
      },
    });

    return await result.json();
  }

  async getWalletTransactions(walletAddress: string, timeRange: string, limit: number = 100) {
    const timeFilter = this.getTimeRangeFilter(timeRange);
    
    const result = await this.client.query({
      query: `
        SELECT 
          signature,
          slot,
          block_time,
          fee,
          status,
          compute_units_consumed,
          programs_invoked,
          transaction_type,
          amount
        FROM wallet_transactions
        WHERE wallet_address = {wallet_address:String}
          AND block_time >= {start:DateTime64}
        ORDER BY block_time DESC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        wallet_address: walletAddress,
        start: timeFilter.start,
        limit,
      },
    });

    return await result.json();
  }

  async getTopWallets(timeRange: string, limit: number = 50) {
    const timeFilter = this.getTimeRangeFilter(timeRange);
    
    const result = await this.client.query({
      query: `
        SELECT 
          wallet_address,
          count() as transaction_count,
          sum(compute_units_consumed) as total_cu_consumed,
          uniqExact(arrayJoin(programs_invoked)) as unique_programs
        FROM wallet_transactions 
        WHERE block_time >= {start:DateTime64}
        GROUP BY wallet_address
        ORDER BY transaction_count DESC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        start: timeFilter.start,
        limit,
      },
    });

    return await result.json();
  }

  async calculateWalletStats(walletAddress: string, timeRange: string) {
    const timeFilter = this.getTimeRangeFilter(timeRange);
    
    const result = await this.client.query({
      query: `
        SELECT 
          count(DISTINCT signature) as totalTransactions,
          sum(compute_units_consumed) as totalCuConsumed,
          uniqExact(arrayJoin(programs_invoked)) as uniqueProgramsUsed,
          sum(fee) as totalFeesPaid,
          min(block_time) as firstTransaction,
          max(block_time) as lastTransaction
        FROM wallet_transactions 
        WHERE wallet_address = {wallet_address:String}
          AND block_time >= {start:DateTime64}
      `,
      query_params: {
        wallet_address: walletAddress,
        start: timeFilter.start,
      },
    });

    const data = await result.json();
    return data.data && data.data[0] ? data.data[0] : null;
  }

  private getTimeRangeFilter(timeRange: string): { start: Date } {
    const now = new Date();
    let start: Date;

    switch (timeRange) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start };
  }
}

export const clickHouseManager = new ClickHouseManager();