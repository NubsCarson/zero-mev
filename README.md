# Zero MEV

Solana program activity tracker with validator-level invocation analytics and a
web dashboard.

## What It Does

- Ingests Solana blocks and tracks which programs are invoked.
- Shows top programs by usage with DeFi protocol categories.
- Provides live block and validator activity views.
- Supports a program blacklist and time-series analytics.

## Quick Start

```bash
pnpm install
pnpm run dev:db
cp .env.example .env
pnpm run migrate
pnpm run dev
```

Open `http://localhost:3000`.

## Environment

Set these in `.env`:

```bash
SOL_RPC=https://api.mainnet-beta.solana.com
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASS=changeme
CLICKHOUSE_DB=solana
```

Use a real secret for shared or internet-exposed ClickHouse instances. The
checked-in Docker Compose password is a local development placeholder only.

## Commands

```bash
pnpm run dev        # Start web app and worker
pnpm run dev:db     # Start local ClickHouse
pnpm run dev:web    # Start web app only
pnpm run dev:worker # Start ingestion worker only
pnpm run migrate    # Create database tables
pnpm run build      # Build all packages
```

## License

MIT. See [LICENSE](LICENSE).
