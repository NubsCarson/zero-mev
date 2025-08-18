# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
```bash
# Start the full development environment (migrates DB, starts web app + worker)
pnpm run dev

# Individual components
pnpm run dev:db     # Start ClickHouse container only
pnpm run dev:web    # Start Next.js development server only  
pnpm run dev:worker # Start Solana ingestion worker only

# Database operations
pnpm run migrate    # Run ClickHouse migrations (creates tables and materialized views)

# Production builds
pnpm run build      # Build all packages using Turbo
pnpm run lint       # Lint web application code
```

### Worker Commands with Environment Variables
```bash
# Standard development with backfill
cd apps/worker && SOL_RPC=https://rpc.zeroblock.io CLICKHOUSE_PASS=password1984 npx tsx src/ingest.ts

# With specific backfill amount
cd apps/worker && SOL_RPC=https://rpc.zeroblock.io CLICKHOUSE_PASS=password1984 INGEST_BACKFILL_SLOTS=100 npx tsx src/ingest.ts

# Web app with ClickHouse auth
cd apps/web && CLICKHOUSE_PASS=password1984 pnpm dev
```

### Docker Operations
```bash
# Start ClickHouse (use docker-compose, not docker compose)
docker-compose -f docker/docker-compose.yml up -d

# Stop and cleanup
docker-compose -f docker/docker-compose.yml down
```

## Architecture Overview

### Monorepo Structure
- **pnpm workspaces**: `apps/*` and `packages/*` pattern
- **Turbo**: Used for build orchestration and caching
- **TypeScript**: Strict typing across all packages

### Core Applications

#### `apps/web` - Next.js 14 Frontend
- **App Router**: Uses Next.js 14+ App Router pattern (`app/` directory)
- **API Routes**: REST endpoints in `app/api/` following App Router conventions
- **UI Components**: Located in `components/` directory
- **Program Registry**: `lib/programRegistry.ts` categorizes 56+ DeFi protocols with color-coded tags
- **Styling**: Tailwind CSS with dark theme, extensive use of gray color palette

#### `apps/worker` - Solana Block Ingestion
- **Single file worker**: `src/ingest.ts` handles all block processing
- **Leader schedule caching**: Automatically fetches and caches validator information
- **Concurrent processing**: Configurable via `INGEST_CONCURRENCY` environment variable
- **Instruction parsing**: Handles both outer and inner instructions from Solana blocks

#### `packages/db` - Shared ClickHouse Layer
- **Client abstraction**: `src/client.ts` provides ClickHouse connection
- **Migration system**: `src/migrate.ts` creates tables and materialized views
- **Environment handling**: `src/env.ts` validates configuration with Zod

### Database Schema (ClickHouse)

#### Core Tables
1. **`program_invocations`** (MergeTree)
   - Raw invocation data: slot, block_time, validator, program_id, tx_sig, instruction_ix, source
   - Partitioned by month (`toYYYYMM(block_time)`)
   - Ordered by (slot, program_id)

2. **`program_blacklist`** (ReplacingMergeTree)
   - Managed via `ALTER TABLE DELETE` for immediate removal
   - Uses `added_at` as version column for ReplacingMergeTree
   - Supports soft deletion with empty reason strings

3. **`invocations_hour`** (SummingMergeTree)
   - Auto-populated by materialized view `mv_invocations_hour`
   - Aggregates raw data into hourly buckets
   - Used for all dashboard queries to improve performance

### Program Categorization System

The application categorizes 56+ known DeFi protocols into colored categories:
- **DEX** (Blue): Aldrin, Phoenix, Orca, Raydium, OpenBook, etc.
- **AMM** (Green): Meteora, Crema, Lifinity, Saber, Mercurial, etc.
- **Perp** (Red): Perpetual protocol contracts
- **Staking** (Yellow): Sanctum, Solayer staking protocols
- **Launchpad** (Orange): Pump.fun, Boop.fun, token launch platforms
- **Gaming** (Pink): StepN and gaming protocols
- **Infra** (Cyan): Helium Network and infrastructure
- **System** (Slate): Native Solana programs (Vote, Token, etc.)

Categories are automatically assigned based on protocol name patterns in `lib/programRegistry.ts`.

### API Patterns

#### Import Path Strategy
API routes use relative imports to the db package:
- Root level: `../../../../../packages/db/src`
- Nested routes: Count directory depth and adjust accordingly
- Critical: Use exact relative paths, absolute imports will fail

#### ClickHouse Query Patterns
- Always use parameterized queries: `{param:Type}` syntax
- Handle timezone issues: Remove 'Z' suffix from ISO timestamps
- Use `FINAL` operator for ReplacingMergeTree and SummingMergeTree tables
- Apply `WHERE reason != ''` filtering for blacklist queries

#### Error Handling
- Log extensively with emoji prefixes for debugging (🗑️, 📝, ✅, ❌, etc.)
- Return structured error responses with `{ error: string, details?: string }`
- Handle ClickHouse connection failures gracefully

### UI/UX Patterns

#### Component Structure
- **ProgramTag**: Color-coded program display with category badges
- **LineChart**: D3-based time series visualization
- **Enhanced Timeline**: Rich program analysis with stats, charts, and recent activity tables
- **Block Explorer**: Live streaming block data with search functionality

#### State Management
- React hooks for local state
- Manual fetch patterns (no external state library)
- Real-time updates with `setInterval` for live block streaming

#### Design System
- Dark theme with gray-800/900 backgrounds
- Color-coded metrics (blue, green, purple, etc.)
- Consistent card layouts with rounded corners
- Progress bars and gradients for data visualization

## Environment Variables

### Required for Development
```bash
CLICKHOUSE_PASS=password1984     # Default ClickHouse password
SOL_RPC=https://rpc.zeroblock.io # Solana RPC endpoint
```

### Optional Configuration
```bash
CLICKHOUSE_URL=http://localhost:8123  # ClickHouse HTTP interface
CLICKHOUSE_USER=default               # ClickHouse username  
CLICKHOUSE_DB=solana                 # Database name
INGEST_BACKFILL_SLOTS=20000          # Slots to backfill on worker startup
INGEST_COMMITMENT=confirmed          # Solana commitment level
INGEST_CONCURRENCY=8                 # Concurrent slot processing
```

## Development Patterns

### Adding New API Endpoints
1. Create route in `apps/web/app/api/[endpoint]/route.ts`
2. Use correct relative import path to db package
3. Follow parameterized query patterns for ClickHouse
4. Add comprehensive logging for debugging
5. Handle errors with structured responses

### Modifying Database Schema
1. Update `packages/db/src/migrate.ts`
2. Consider ClickHouse engine types (MergeTree variants)
3. Plan partitioning strategy for time-series data
4. Test with `pnpm run migrate`

### Working with Program Categories
1. Update `programlist.json` for new protocols
2. Modify categorization logic in `lib/programRegistry.ts`
3. Ensure all programs get assigned non-"Other" categories
4. Test color coding in UI components

### Performance Considerations
- Use materialized views for aggregations (`invocations_hour`)
- Implement proper ClickHouse partitioning by month
- Limit concurrent worker processing to avoid RPC rate limits
- Use `OPTIMIZE TABLE FINAL` sparingly for immediate consistency needs