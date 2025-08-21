import { Request, Response } from 'express';
import { ingestWalletData } from '../../workers/ingest-wallet-data.js';
import { clickHouseManager } from '../../database/client.js';

export async function handleIngestWallet(req: Request, res: Response) {
  try {
    const { wallet, timeRange = '24h' } = req.query;
    
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    console.log(`📥 Ingestion request for wallet: ${wallet}, timeRange: ${timeRange}`);
    
    // Start ingestion in background
    ingestWalletData(wallet as string, timeRange as string)
      .then(count => {
        console.log(`✅ Wallet ingestion completed: ${count} transactions processed`);
      })
      .catch(error => {
        console.error('❌ Wallet ingestion error:', error);
      });
    
    res.json({ 
      message: 'Wallet ingestion started', 
      wallet,
      timeRange,
      status: 'processing'
    });
    
  } catch (error) {
    console.error('Error in wallet ingest endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function searchWallets(req: Request, res: Response) {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const wallets = await clickHouseManager.searchWallets(q, Number(limit));
    res.json(wallets);
  } catch (error) {
    console.error('Error searching wallets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getWalletStats(req: Request, res: Response) {
  try {
    const { walletId } = req.params;
    const { timeRange = '24h' } = req.query;

    const stats = await clickHouseManager.getWalletStats(walletId, timeRange as string);
    res.json(stats);
  } catch (error) {
    console.error('Error getting wallet stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getWalletProgramUsage(req: Request, res: Response) {
  try {
    const { walletId } = req.params;
    const { timeRange = '24h' } = req.query;

    const programUsage = await clickHouseManager.getWalletProgramUsage(walletId, timeRange as string);
    res.json(programUsage);
  } catch (error) {
    console.error('Error getting wallet program usage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getWalletTransactions(req: Request, res: Response) {
  try {
    const { walletId } = req.params;
    const { timeRange = '24h', limit = 100 } = req.query;

    const transactions = await clickHouseManager.getWalletTransactions(
      walletId, 
      timeRange as string, 
      Number(limit)
    );
    res.json(transactions);
  } catch (error) {
    console.error('Error getting wallet transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getTopWallets(req: Request, res: Response) {
  try {
    const { timeRange = '24h', limit = 50 } = req.query;

    const topWallets = await clickHouseManager.getTopWallets(timeRange as string, Number(limit));
    res.json(topWallets);
  } catch (error) {
    console.error('Error getting top wallets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}