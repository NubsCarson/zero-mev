import { Router } from 'express';
import { clickHouseManager } from '../../database/client.js';

const router = Router();

// Get all blacklisted programs
router.get('/', async (req, res) => {
  try {
    const result = await clickHouseManager.getBlacklistedPrograms();
    res.json(result);
  } catch (error) {
    console.error('Error fetching blacklisted programs:', error);
    // Return empty data when database is unavailable
    res.json({ data: [] });
  }
});

// Add program to blacklist
router.post('/', async (req, res) => {
  try {
    const { program_id, reason = '' } = req.body;
    
    if (!program_id || typeof program_id !== 'string') {
      return res.status(400).json({ error: 'Valid program_id is required' });
    }

    // Basic validation for Solana program ID format
    if (program_id.length < 32 || program_id.length > 44) {
      return res.status(400).json({ error: 'Invalid program ID format' });
    }

    // Check if already blacklisted
    const isAlreadyBlacklisted = await clickHouseManager.isBlacklisted(program_id);
    if (isAlreadyBlacklisted) {
      return res.status(409).json({ error: 'Program is already blacklisted' });
    }

    await clickHouseManager.addToBlacklist(program_id, reason);
    res.json({ success: true, message: 'Program added to blacklist' });
  } catch (error) {
    console.error('Error adding program to blacklist:', error);
    res.status(500).json({ error: 'Failed to add program to blacklist' });
  }
});

// Remove program from blacklist
router.delete('/:programId', async (req, res) => {
  try {
    const { programId } = req.params;
    
    if (!programId || typeof programId !== 'string') {
      return res.status(400).json({ error: 'Valid program ID is required' });
    }

    // Check if program exists in blacklist
    const isBlacklisted = await clickHouseManager.isBlacklisted(programId);
    if (!isBlacklisted) {
      return res.status(404).json({ error: 'Program is not blacklisted' });
    }

    await clickHouseManager.removeFromBlacklist(programId);
    res.json({ success: true, message: 'Program removed from blacklist' });
  } catch (error) {
    console.error('Error removing program from blacklist:', error);
    res.status(500).json({ error: 'Failed to remove program from blacklist' });
  }
});

// Check if program is blacklisted
router.get('/check/:programId', async (req, res) => {
  try {
    const { programId } = req.params;
    
    if (!programId || typeof programId !== 'string') {
      return res.status(400).json({ error: 'Valid program ID is required' });
    }

    const isBlacklisted = await clickHouseManager.isBlacklisted(programId);
    res.json({ program_id: programId, is_blacklisted: isBlacklisted });
  } catch (error) {
    console.error('Error checking blacklist status:', error);
    res.status(500).json({ error: 'Failed to check blacklist status' });
  }
});

// Clear all blacklisted programs
router.delete('/', async (req, res) => {
  try {
    await clickHouseManager.clearBlacklist();
    res.json({ success: true, message: 'All programs removed from blacklist' });
  } catch (error) {
    console.error('Error clearing blacklist:', error);
    res.status(500).json({ error: 'Failed to clear blacklist' });
  }
});

export default router;