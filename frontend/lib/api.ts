import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased to 30 seconds for data ingestion
});

// Separate instance for quick polling calls
const apiQuick = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10 seconds for polling calls
});

export interface ValidatorStats {
  validator_identity: string;
  blocks_produced: number;
  total_transactions: number;
  total_cu_consumed: number;
  avg_transactions_per_block: number;
}

export interface ProgramUsage {
  program_id: string;
  program_name: string;
  category: string;
  total_invocations: number;
  total_cu_consumed: number;
  blocks_used: number;
}

export interface ValidatorSearchResult {
  validator_identity: string;
  blocks_produced: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  blocks_produced: number;
  transactions: number;
  cu_consumed: number;
}

export const searchValidators = async (query: string, limit = 20): Promise<ValidatorSearchResult[]> => {
  const response = await api.get('/api/validators/search', {
    params: { q: query, limit },
  });
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data.map((item: any) => ({
      validator_identity: item.validator_identity,
      blocks_produced: Number(item.blocks_produced)
    }));
  }
  return response.data;
};

// Retry utility function
const retryRequest = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
  let lastError: Error;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (i === maxRetries) break;
      
      // Only retry on 500+ errors or network errors
      if (error.response?.status >= 500 || error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('socket hang up')) {
        const delay = Math.min(1000 * Math.pow(2, i), 10000); // Exponential backoff, max 10s
        console.log(`API request failed (attempt ${i + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break; // Don't retry client errors (4xx)
      }
    }
  }
  throw lastError!;
};

export const getValidatorStats = async (validatorId: string, timeRange = '24h'): Promise<ValidatorStats[]> => {
  const response = await retryRequest(() => 
    api.get(`/api/validators/${encodeURIComponent(validatorId)}/stats`, {
      params: { timeRange },
    })
  );
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getValidatorProgramUsage = async (validatorId: string, timeRange = '24h'): Promise<ProgramUsage[]> => {
  const response = await retryRequest(() => 
    api.get(`/api/validators/${encodeURIComponent(validatorId)}/programs`, {
      params: { timeRange },
    })
  );
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

// Quick polling versions with shorter timeouts
export const getValidatorStatsQuick = async (validatorId: string, timeRange = '24h'): Promise<ValidatorStats[]> => {
  const response = await retryRequest(() => 
    apiQuick.get(`/api/validators/${encodeURIComponent(validatorId)}/stats`, {
      params: { timeRange },
    }), 2 // Fewer retries for quick calls
  );
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getValidatorProgramUsageQuick = async (validatorId: string, timeRange = '24h'): Promise<ProgramUsage[]> => {
  const response = await retryRequest(() => 
    apiQuick.get(`/api/validators/${encodeURIComponent(validatorId)}/programs`, {
      params: { timeRange },
    }), 2 // Fewer retries for quick calls
  );
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getTopValidators = async (timeRange = '24h', limit = 50): Promise<ValidatorSearchResult[]> => {
  const response = await api.get('/api/validators/top', {
    params: { timeRange, limit },
  });
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data.map((item: any) => ({
      validator_identity: item.validator_identity,
      blocks_produced: Number(item.blocks_produced)
    }));
  }
  return response.data;
};

export const getValidatorTimeSeries = async (
  validatorId: string,
  timeRange = '24h',
  interval = '1h'
): Promise<TimeSeriesPoint[]> => {
  const response = await api.get(`/api/validators/${encodeURIComponent(validatorId)}/timeseries`, {
    params: { timeRange, interval },
  });
  return response.data;
};

export const triggerValidatorIngestion = async (validatorId: string, timeRange = '24h'): Promise<{ message: string; status: string }> => {
  const response = await api.get('/api/ingest', {
    params: { validator: validatorId, timeRange },
  });
  return response.data;
};

