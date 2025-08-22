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
      
      // Ensure all required tables exist
      await this.ensureTablesExist();
    } catch (error) {
      console.error('❌ Failed to initialize ClickHouse:', error);
      throw error;
    }
  }

  private async setupSchema() {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const schemaFiles = [
        'src/database/schema.sql',
        'src/database/wallet-schema.sql'
      ];
      
      for (const schemaFile of schemaFiles) {
        const schemaPath = path.join(process.cwd(), schemaFile);
        
        try {
          const schema = await fs.readFile(schemaPath, 'utf-8');
          
          // Split by semicolon and execute each statement
          const statements = schema.split(';').filter(stmt => stmt.trim());
          
          for (const statement of statements) {
            if (statement.trim()) {
              await this.client.exec({ query: statement });
            }
          }
          
          console.log(`✅ Schema from ${schemaFile} initialized`);
        } catch (error) {
          console.warn(`⚠️ Failed to load ${schemaFile}:`, error.message);
        }
      }
      
      console.log('✅ Database schema setup completed');
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

  // Health check method to ensure required tables exist
  async ensureTablesExist() {
    const requiredTables = ['blocks', 'program_usage', 'programs', 'wallet_transactions'];
    
    for (const tableName of requiredTables) {
      try {
        const result = await this.client.query({
          query: `SELECT name FROM system.tables WHERE database = '${config.clickhouse.database}' AND name = {table_name:String}`,
          query_params: { table_name: tableName }
        });
        
        const data = await result.json();
        const exists = data.data && data.data.length > 0;
        
        if (!exists) {
          console.warn(`⚠️ Table ${tableName} does not exist. Run database initialization.`);
          
          // If wallet_transactions is missing, try to create it from wallet-schema.sql
          if (tableName === 'wallet_transactions') {
            await this.createWalletTransactionsTable();
          }
        } else {
          console.log(`✅ Table ${tableName} exists`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not check table ${tableName}:`, error.message);
      }
    }
  }

  // Create wallet_transactions table if it doesn't exist
  private async createWalletTransactionsTable() {
    try {
      console.log('🔧 Creating wallet_transactions table...');
      
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS wallet_transactions (
          signature String,
          wallet_address String,
          slot UInt64,
          block_time DateTime64(3),
          fee UInt64,
          status String,
          compute_units_consumed UInt64,
          programs_invoked Array(String),
          transaction_type String,
          amount Nullable(UInt64),
          INDEX idx_wallet wallet_address TYPE bloom_filter(0.01) GRANULARITY 1,
          INDEX idx_slot slot TYPE minmax GRANULARITY 1,
          INDEX idx_block_time block_time TYPE minmax GRANULARITY 1,
          INDEX idx_signature signature TYPE bloom_filter(0.01) GRANULARITY 1
        ) ENGINE = MergeTree()
        ORDER BY (wallet_address, block_time, signature)
        PARTITION BY toYYYYMM(block_time)
        TTL toDateTime(block_time) + INTERVAL 90 DAY
      `;
      
      await this.client.exec({ query: createTableQuery });
      console.log('✅ wallet_transactions table created successfully');
    } catch (error) {
      console.error('❌ Failed to create wallet_transactions table:', error);
      throw error;
    }
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

  async insertWalletTransactions(transactions: Array<{
    signature: string;
    slot: number;
    blockTime: Date;
    fee: number;
    status: string;
    computeUnitsConsumed: number;
    programsInvoked: string[];
    transactionType: string;
    amount: number | null;
    walletAddress: string;
  }>) {
    if (transactions.length === 0) return;

    await this.client.insert({
      table: 'wallet_transactions',
      values: transactions.map(tx => ({
        signature: tx.signature,
        wallet_address: tx.walletAddress,
        slot: tx.slot,
        block_time: tx.blockTime.toISOString().replace(/\.\d{3}Z$/, ''),
        fee: tx.fee,
        status: tx.status,
        compute_units_consumed: tx.computeUnitsConsumed,
        programs_invoked: tx.programsInvoked,
        transaction_type: tx.transactionType,
        amount: tx.amount,
      })),
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

  async searchWalletsByValidator(validatorQuery: string, timeRange: string, limit: number = 20) {
    const timeFilter = this.getTimeRangeFilter(timeRange);
    
    const result = await this.client.query({
      query: `
        SELECT 
          wt.wallet_address,
          count(DISTINCT wt.signature) as total_transactions,
          sum(wt.compute_units_consumed) as total_cu_consumed,
          sum(wt.fee) as total_fees_paid,
          count(DISTINCT wt.slot) as blocks_interacted,
          min(wt.block_time) as first_interaction,
          max(wt.block_time) as last_interaction
        FROM wallet_transactions wt
        JOIN blocks b ON wt.slot = b.slot
        WHERE b.validator_identity LIKE {validator_query:String}
          AND wt.block_time >= {start:DateTime64}
          AND wt.wallet_address NOT IN (SELECT wallet_address FROM wallet_blacklist)
        GROUP BY wt.wallet_address
        ORDER BY total_transactions DESC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        validator_query: `%${validatorQuery}%`,
        start: timeFilter.start,
        limit: limit,
      },
    });
    return await result.json();
  }

  // Blacklist management methods
  async getBlacklistedPrograms() {
    const result = await this.client.query({
      query: `
        SELECT program_id, blacklisted_at, reason
        FROM program_blacklist
        ORDER BY blacklisted_at DESC
      `,
    });
    return await result.json();
  }

  async addToBlacklist(programId: string, reason: string = '') {
    await this.client.insert({
      table: 'program_blacklist',
      values: [{
        program_id: programId,
        reason: reason,
      }],
      format: 'JSONEachRow',
    });
  }

  async removeFromBlacklist(programId: string) {
    await this.client.exec({
      query: `ALTER TABLE program_blacklist DELETE WHERE program_id = {program_id:String}`,
      query_params: {
        program_id: programId,
      },
    });
  }

  async isBlacklisted(programId: string): Promise<boolean> {
    const result = await this.client.query({
      query: `
        SELECT count() as count
        FROM program_blacklist
        WHERE program_id = {program_id:String}
      `,
      query_params: {
        program_id: programId,
      },
    });
    const data = await result.json();
    return data.data && data.data[0] && Number(data.data[0].count) > 0;
  }

  async clearBlacklist() {
    await this.client.exec({
      query: `TRUNCATE TABLE program_blacklist`,
    });
  }

  // Wallet blacklist management methods
  async getBlacklistedWallets() {
    const result = await this.client.query({
      query: `
        SELECT wallet_address, blacklisted_at, reason
        FROM wallet_blacklist
        ORDER BY blacklisted_at DESC
      `,
    });
    return await result.json();
  }

  async addWalletToBlacklist(walletAddress: string, reason: string = '') {
    await this.client.insert({
      table: 'wallet_blacklist',
      values: [{
        wallet_address: walletAddress,
        reason: reason,
      }],
      format: 'JSONEachRow',
    });
  }

  async removeWalletFromBlacklist(walletAddress: string) {
    await this.client.exec({
      query: `ALTER TABLE wallet_blacklist DELETE WHERE wallet_address = {wallet_address:String}`,
      query_params: {
        wallet_address: walletAddress,
      },
    });
  }

  async isWalletBlacklisted(walletAddress: string): Promise<boolean> {
    const result = await this.client.query({
      query: `
        SELECT count() as count
        FROM wallet_blacklist
        WHERE wallet_address = {wallet_address:String}
      `,
      query_params: {
        wallet_address: walletAddress,
      },
    });
    const data = await result.json();
    return data.data && data.data[0] && Number(data.data[0].count) > 0;
  }

  async clearWalletBlacklist() {
    await this.client.exec({
      query: `TRUNCATE TABLE wallet_blacklist`,
    });
  }

  // Modified program usage methods to filter blacklisted programs
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
          AND pu.program_id NOT IN (SELECT program_id FROM program_blacklist)
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

  async getWalletProgramUsage(walletAddress: string, timeRange: string) {
    const timeFilter = this.getTimeRangeFilter(timeRange);
    
    const result = await this.client.query({
      query: `
        SELECT 
          arrayJoin(programs_invoked) as program_id,
          count() as total_invocations,
          sum(compute_units_consumed) as total_cu_consumed,
          count(DISTINCT signature) as transaction_count
        FROM wallet_transactions wt
        LEFT JOIN program_blacklist pb ON arrayJoin(programs_invoked) = pb.program_id
        WHERE wt.wallet_address = {wallet_address:String}
          AND wt.block_time >= {start:DateTime64}
          AND pb.program_id IS NULL
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
}

export const clickHouseManager = new ClickHouseManager();