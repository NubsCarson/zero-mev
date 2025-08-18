# Solana Program Tracker

Tracks Solana program invocation frequency per validator with a web dashboard and block explorer.

## What it does

- Ingests Solana blocks and tracks which programs are called
- Shows top programs by usage with color-coded DeFi protocol categories  
- Live block explorer with validator and program activity
- Program blacklist management
- Time-series charts and analytics

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start ClickHouse database
docker-compose -f docker/docker-compose.yml up -d

# 3. Run database migrations
CLICKHOUSE_PASS=password1984 pnpm run migrate

# 4. Start everything
CLICKHOUSE_PASS=password1984 pnpm run dev
```

Open http://localhost:3000

## Environment Variables

Set these in `.env`:
```bash
SOL_RPC=https://rpc.zeroblock.io  # Solana RPC endpoint
CLICKHOUSE_PASS=password1984      # ClickHouse password
```

## Commands

```bash
pnpm run dev        # Start web app + worker
pnpm run dev:web    # Start web app only  
pnpm run dev:worker # Start ingestion worker only
pnpm run migrate    # Create database tables
```# zero-mev
