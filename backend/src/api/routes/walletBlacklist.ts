import express from 'express';
import { clickHouseManager } from '../../database/client.js';

const router = express.Router();

// Get all blacklisted wallets
router.get('/', async (req, res) => {
  try {
    const wallets = await clickHouseManager.getBlacklistedWallets();
    res.json(wallets);
  } catch (error) {
    console.error('Error fetching blacklisted wallets:', error);
    // Return empty data when database is unavailable
    res.json({ data: [] });
  }
});

// Add wallet to blacklist
router.post('/', async (req, res) => {
  try {
    const { wallet_address, reason = '' } = req.body;
    
    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    await clickHouseManager.addWalletToBlacklist(wallet_address, reason);
    res.json({ success: true, message: 'Wallet added to blacklist' });
  } catch (error) {
    console.error('Error adding wallet to blacklist:', error);
    res.status(500).json({ error: 'Failed to add wallet to blacklist' });
  }
});

// Remove wallet from blacklist
router.delete('/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    await clickHouseManager.removeWalletFromBlacklist(walletAddress);
    res.json({ success: true, message: 'Wallet removed from blacklist' });
  } catch (error) {
    console.error('Error removing wallet from blacklist:', error);
    res.status(500).json({ error: 'Failed to remove wallet from blacklist' });
  }
});

// Clear all blacklisted wallets
router.delete('/', async (req, res) => {
  try {
    await clickHouseManager.clearWalletBlacklist();
    res.json({ success: true, message: 'All wallets removed from blacklist' });
  } catch (error) {
    console.error('Error clearing wallet blacklist:', error);
    res.status(500).json({ error: 'Failed to clear wallet blacklist' });
  }
});

export default router;