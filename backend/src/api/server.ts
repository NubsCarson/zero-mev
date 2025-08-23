import express from 'express';
import cors from 'cors';
import { config } from '../config/index.js';
import { clickHouseManager } from '../database/client.js';
import { handleIngestValidator } from './routes/ingest.js';
import { 
  handleIngestWallet, 
  searchWallets, 
  getWalletStats, 
  getWalletProgramUsage, 
  getWalletTransactions,
  getTopWallets 
} from './routes/wallet.js';
import blacklistRoutes from './routes/blacklist.js';
import walletBlacklistRoutes from './routes/walletBlacklist.js';

const app = express();

// Middleware - Allow all origins for easy deployment
app.use(cors({
  origin: '*',
  credentials: false,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// Ingest validator data endpoint
app.get('/api/ingest', handleIngestValidator);

// Search validators
app.get('/api/validators/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const validators = await clickHouseManager.searchValidators(q, Number(limit));
    res.json(validators);
  } catch (error) {
    console.error('Error searching validators:', error);
    // Return empty data when database is unavailable
    res.json({ data: [] });
  }
});

// Get validator statistics
app.get('/api/validators/:validatorId/stats', async (req, res) => {
  try {
    const { validatorId } = req.params;
    const { timeRange = '24h' } = req.query;

    const timeRanges = getTimeRange(timeRange as string);
    const stats = await clickHouseManager.getValidatorStats(validatorId, timeRanges);
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting validator stats:', error);
    // Return empty stats when database is unavailable
    res.json({ 
      totalBlocks: 0,
      totalTransactions: 0,
      totalCuConsumed: 0,
      avgBlockTime: 0,
      successRate: 0
    });
  }
});

// Get validator program usage
app.get('/api/validators/:validatorId/programs', async (req, res) => {
  try {
    const { validatorId } = req.params;
    const { timeRange = '24h' } = req.query;

    const timeRanges = getTimeRange(timeRange as string);
    const programUsage = await clickHouseManager.getValidatorProgramUsage(validatorId, timeRanges);
    
    res.json(programUsage);
  } catch (error) {
    console.error('Error getting validator program usage:', error);
    // Return empty data when database is unavailable
    res.json({ data: [] });
  }
});

// Get top validators
app.get('/api/validators/top', async (req, res) => {
  try {
    const { timeRange = '24h', limit = 50 } = req.query;

    const timeRanges = getTimeRange(timeRange as string);
    const topValidators = await clickHouseManager.getTopValidators(timeRanges, Number(limit));
    
    res.json(topValidators);
  } catch (error) {
    console.error('Error getting top validators:', error);
    // Return empty data when database is unavailable
    res.json({ data: [] });
  }
});

// Wallet endpoints
app.get('/api/ingest-wallet', handleIngestWallet);
app.get('/api/wallets/search', searchWallets);
app.get('/api/wallets/:walletId/stats', getWalletStats);
app.get('/api/wallets/:walletId/programs', getWalletProgramUsage);
app.get('/api/wallets/:walletId/transactions', getWalletTransactions);
app.get('/api/wallets/top', getTopWallets);

// Blacklist endpoints
app.use('/api/blacklist', blacklistRoutes);

// Wallet blacklist endpoints
app.use('/api/wallet-blacklist', walletBlacklistRoutes);


// Get time-series data for validator
app.get('/api/validators/:validatorId/timeseries', async (req, res) => {
  try {
    const { validatorId } = req.params;
    const { timeRange = '24h', interval = '1h' } = req.query;

    // This would be implemented with a more complex ClickHouse query
    // For now, return mock data
    const mockTimeSeries = generateMockTimeSeries(timeRange as string, interval as string);
    
    res.json(mockTimeSeries);
  } catch (error) {
    console.error('Error getting validator timeseries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function getTimeRange(timeRange: string): { start: Date; end: Date } {
  const end = new Date();
  let start: Date;

  switch (timeRange) {
    case '1h':
      start = new Date(end.getTime() - 60 * 60 * 1000);
      break;
    case '6h':
      start = new Date(end.getTime() - 6 * 60 * 60 * 1000);
      break;
    case '24h':
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  }

  return { start, end };
}

function generateMockTimeSeries(timeRange: string, interval: string) {
  const { start, end } = getTimeRange(timeRange);
  const intervalMs = parseInterval(interval);
  const points = [];

  for (let time = start.getTime(); time <= end.getTime(); time += intervalMs) {
    points.push({
      timestamp: new Date(time).toISOString(),
      blocks_produced: Math.floor(Math.random() * 10) + 1,
      transactions: Math.floor(Math.random() * 1000) + 100,
      cu_consumed: Math.floor(Math.random() * 10000000) + 1000000,
    });
  }

  return points;
}

function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)([hm])$/);
  if (!match) return 60 * 60 * 1000; // Default to 1 hour

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'h':
      return value * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}


export async function startServer() {
  try {
    await clickHouseManager.initialize();
    
    const port = config.server.port;
    app.listen(port, () => {
      console.log(`🚀 API server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

export { app };