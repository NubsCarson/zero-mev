-- Additional schema for wallet tracking functionality
USE validator_analytics;

-- Table for storing wallet transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
    signature String,
    wallet_address String,
    slot UInt64,
    block_time DateTime64(3),
    fee UInt64,
    status String,
    compute_units_consumed UInt64,
    programs_invoked Array(String),
    transaction_type String, -- 'transfer', 'swap', 'stake', 'other'
    amount Nullable(UInt64), -- Amount if it's a transfer
    INDEX idx_wallet wallet_address TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_slot slot TYPE minmax GRANULARITY 1,
    INDEX idx_block_time block_time TYPE minmax GRANULARITY 1,
    INDEX idx_signature signature TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (wallet_address, block_time, signature)
PARTITION BY toYYYYMM(block_time)
TTL toDateTime(block_time) + INTERVAL 90 DAY;

-- Table for wallet program usage
CREATE TABLE IF NOT EXISTS wallet_program_usage (
    wallet_address String,
    program_id String,
    invocation_count UInt32,
    cu_consumed UInt64,
    transaction_count UInt32,
    last_used DateTime64(3),
    time_period String, -- '1h', '24h', '7d', '30d'
    INDEX idx_wallet wallet_address TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_program program_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_last_used last_used TYPE minmax GRANULARITY 1
) ENGINE = ReplacingMergeTree(last_used)
ORDER BY (wallet_address, program_id, time_period);

-- Table for wallet statistics
CREATE TABLE IF NOT EXISTS wallet_stats (
    wallet_address String,
    total_transactions UInt64,
    total_cu_consumed UInt64,
    unique_programs_used UInt32,
    total_fees_paid UInt64,
    first_transaction DateTime64(3),
    last_transaction DateTime64(3),
    time_period String, -- '1h', '24h', '7d', '30d', 'all'
    INDEX idx_wallet wallet_address TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_last_transaction last_transaction TYPE minmax GRANULARITY 1
) ENGINE = ReplacingMergeTree(last_transaction)
ORDER BY (wallet_address, time_period);

-- Materialized view for wallet program usage aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS wallet_program_usage_hourly
ENGINE = SummingMergeTree()
ORDER BY (wallet_address, program_id, hour)
POPULATE AS
SELECT
    wallet_address,
    arrayJoin(programs_invoked) as program_id,
    toStartOfHour(block_time) as hour,
    count() as invocation_count,
    sum(compute_units_consumed) as total_cu_consumed,
    max(block_time) as last_used
FROM wallet_transactions
GROUP BY wallet_address, program_id, hour;

-- Materialized view for wallet stats aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS wallet_stats_daily
ENGINE = SummingMergeTree()
ORDER BY (wallet_address, day)
POPULATE AS
SELECT
    wallet_address,
    toStartOfDay(block_time) as day,
    count() as transaction_count,
    sum(compute_units_consumed) as total_cu_consumed,
    sum(fee) as total_fees,
    uniqExact(arrayJoin(programs_invoked)) as unique_programs
FROM wallet_transactions
GROUP BY wallet_address, day;