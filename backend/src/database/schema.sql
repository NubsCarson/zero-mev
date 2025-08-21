-- ClickHouse schema for validator program usage analytics

CREATE DATABASE IF NOT EXISTS validator_analytics;

USE validator_analytics;

-- Table for storing block information
CREATE TABLE IF NOT EXISTS blocks (
    slot UInt64,
    hash String,
    parent_hash String,
    validator_identity String,
    timestamp DateTime64(3),
    transaction_count UInt32,
    total_cu_consumed UInt64,
    INDEX idx_slot slot TYPE minmax GRANULARITY 1,
    INDEX idx_validator validator_identity TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (slot, validator_identity)
PARTITION BY toYYYYMM(timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Table for storing program usage in each block
CREATE TABLE IF NOT EXISTS program_usage (
    slot UInt64,
    validator_identity String,
    program_id String,
    invocation_count UInt32,
    percentage Float32,
    cu_consumed UInt64,
    timestamp DateTime64(3),
    INDEX idx_slot slot TYPE minmax GRANULARITY 1,
    INDEX idx_validator validator_identity TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_program program_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (slot, validator_identity, program_id)
PARTITION BY toYYYYMM(timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Table for program metadata
CREATE TABLE IF NOT EXISTS programs (
    program_id String,
    name String,
    category String,
    description String,
    is_system_program Bool DEFAULT 0,
    INDEX idx_program_id program_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_category category TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = ReplacingMergeTree()
ORDER BY program_id;

-- Insert common Solana system programs (optional, can be populated later)

-- Materialized view for aggregated validator stats
CREATE MATERIALIZED VIEW IF NOT EXISTS validator_stats_hourly
ENGINE = SummingMergeTree()
ORDER BY (validator_identity, hour)
POPULATE AS
SELECT
    validator_identity,
    toStartOfHour(timestamp) as hour,
    count() as blocks_produced,
    sum(transaction_count) as total_transactions,
    sum(total_cu_consumed) as total_cu_consumed,
    uniq(program_id) as unique_programs_used
FROM blocks b
LEFT JOIN program_usage pu ON b.slot = pu.slot AND b.validator_identity = pu.validator_identity
GROUP BY validator_identity, hour;

-- Materialized view for program usage statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS program_stats_hourly
ENGINE = SummingMergeTree()
ORDER BY (program_id, hour)
POPULATE AS
SELECT
    program_id,
    toStartOfHour(timestamp) as hour,
    sum(invocation_count) as total_invocations,
    sum(cu_consumed) as total_cu_consumed,
    uniq(validator_identity) as validators_count,
    avg(percentage) as avg_percentage
FROM program_usage
GROUP BY program_id, hour;