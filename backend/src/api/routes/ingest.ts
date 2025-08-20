import { Request, Response } from 'express';
import { ingestValidatorData } from '../../workers/ingest-validator-data.js';

export async function handleIngestValidator(req: Request, res: Response) {
  try {
    const { validator, timeRange = '24h' } = req.query;
    
    if (!validator) {
      return res.status(400).json({ error: 'Validator identity is required' });
    }
    
    console.log(`📥 Ingestion request for validator: ${validator}, timeRange: ${timeRange}`);
    
    // Start ingestion in background
    ingestValidatorData(validator as string, timeRange as string)
      .then(count => {
        console.log(`✅ Ingestion completed: ${count} blocks processed`);
      })
      .catch(error => {
        console.error('❌ Ingestion error:', error);
      });
    
    res.json({ 
      message: 'Ingestion started', 
      validator,
      timeRange,
      status: 'processing'
    });
    
  } catch (error) {
    console.error('Error in ingest endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}