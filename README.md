# Solana Validator Analytics

A comprehensive analytics platform for monitoring Solana validator performance and program usage patterns in real-time.

## Features

- 🔍 **Validator Search**: Search and analyze any Solana validator by name or address
- 📊 **Program Usage Analytics**: Detailed breakdown of which programs validators are processing
- ⚡ **Real-time Data**: Live block updates via Yellowstone gRPC streams
- 📈 **Performance Metrics**: Track blocks produced, transactions, and compute unit consumption
- 🕐 **Time Range Filtering**: Analyze data across different time periods (1h, 6h, 24h, 7d, 30d)
- 🎨 **Beautiful UI**: Modern, responsive dashboard with interactive charts
- 🐳 **Dockerized**: Complete containerized setup with Docker Compose

## Architecture

- **Frontend**: Next.js 15 with TypeScript, Tailwind CSS, and Recharts
- **Backend**: Node.js/Express with TypeScript
- **Database**: ClickHouse for high-performance time-series data
- **Data Source**: Yellowstone gRPC for real-time Solana blockchain data
- **Caching**: Redis for improved performance

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Yellowstone gRPC access (from providers like Triton One, Helius, etc.)

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd zero-mev
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Yellowstone gRPC credentials:
   ```env
   YELLOWSTONE_GRPC_URL=https://your-yellowstone-endpoint.com
   YELLOWSTONE_API_TOKEN=your-api-token
   ```

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - ClickHouse: http://localhost:8123

### Development Setup

If you prefer to run the services individually:

1. **Start ClickHouse**
   ```bash
   docker-compose up clickhouse -d
   ```

2. **Backend Development**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

3. **Frontend Development**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Database Schema

The application uses ClickHouse with the following main tables:

- `blocks`: Block-level metrics (slot, validator, transaction count, CU consumption)
- `program_usage`: Program invocation statistics per block
- `programs`: Program metadata and categorization
- `validator_stats_hourly`: Aggregated hourly validator performance
- `program_stats_hourly`: Aggregated hourly program usage

## API Endpoints

### Validator Search
- `GET /api/validators/search?q={query}` - Search validators by name/address

### Validator Analytics
- `GET /api/validators/{id}/stats?timeRange={range}` - Get validator performance metrics
- `GET /api/validators/{id}/programs?timeRange={range}` - Get program usage breakdown
- `GET /api/validators/{id}/timeseries?timeRange={range}&interval={interval}` - Get time-series data

### Top Lists
- `GET /api/validators/top?timeRange={range}&limit={limit}` - Get top validators by blocks produced

## Program Categories

The system categorizes Solana programs into:

- **System**: Core Solana programs (System, Token, etc.)
- **DEX**: Decentralized exchanges (Serum, Raydium, Jupiter, etc.)
- **Lending**: Lending protocols (Solend, Port, etc.)
- **NFT**: NFT-related programs (Metaplex, etc.)
- **DeFi**: Other DeFi protocols
- **Gaming**: Gaming applications
- **Other**: Uncategorized programs

## Time Range Options

- **1h**: Last hour
- **6h**: Last 6 hours  
- **24h**: Last 24 hours
- **7d**: Last 7 days
- **30d**: Last 30 days

## Performance Considerations

- **Data Retention**: Data is automatically purged after 90 days to manage storage
- **Indexing**: Optimized indexes on slot, validator, program, and timestamp fields
- **Partitioning**: Data partitioned by month for efficient querying
- **Materialized Views**: Pre-aggregated hourly statistics for faster queries

## Monitoring

The application includes:

- Health check endpoints for all services
- Docker health checks
- Automatic reconnection for gRPC streams
- Error handling and logging

## Security

- Non-root Docker containers
- Environment variable configuration
- CORS protection
- Input validation and sanitization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Create an issue in the GitHub repository
- Check the logs: `docker-compose logs [service-name]`

## Yellowstone gRPC Providers

To get access to Yellowstone gRPC streams, you can use:
- [Triton One](https://triton.one/)
- [Helius](https://helius.dev/)
- [QuickNode](https://quicknode.com/)
- Run your own Yellowstone gRPC node

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│   Frontend      │────│   Backend       │────│   ClickHouse    │
│   (Next.js)     │    │   (Node.js)     │    │   (Database)    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                │
                       ┌─────────────────┐
                       │                 │
                       │  Yellowstone    │
                       │  gRPC Stream    │
                       │                 │
                       └─────────────────┘
```