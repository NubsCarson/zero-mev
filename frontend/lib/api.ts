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

interface ClickHouseValidatorItem {
  validator_identity: string;
  blocks_produced: string | number;
}

interface ClickHouseWalletItem {
  wallet_address: string;
  total_transactions: string | number;
  total_cu_consumed: string | number;
  total_fees_paid: string | number;
  blocks_interacted: string | number;
  first_interaction: string;
  last_interaction: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  blocks_produced: number;
  transactions: number;
  cu_consumed: number;
}

export const searchValidators = async (query: string, limit = 10000): Promise<ValidatorSearchResult[]> => {
  const response = await api.get('/api/validators/search', {
    params: { q: query, limit },
  });
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data.map((item: ClickHouseValidatorItem) => ({
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
    } catch (error: unknown) {
      lastError = error as Error;
      if (i === maxRetries) break;
      
      // Only retry on 500+ errors or network errors
      const err = error as Error & { response?: { status?: number }, code?: string, message: string };
      if (err.response?.status && err.response.status >= 500 || err.code === 'ECONNABORTED' || err.message.includes('timeout') || err.message.includes('socket hang up')) {
        const delay = Math.min(1000 * Math.pow(2, i), 10000); // Exponential backoff, max 10s
        console.log(`API request failed (attempt ${i + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, err.message);
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

export const getTopValidators = async (timeRange = '24h', limit = 10000): Promise<ValidatorSearchResult[]> => {
  const response = await api.get('/api/validators/top', {
    params: { timeRange, limit },
  });
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data.map((item: ClickHouseValidatorItem) => ({
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

// Wallet-related API functions
export interface WalletStats {
  wallet_address: string;
  total_transactions: number;
  total_cu_consumed: number;
  unique_programs_used: number;
  total_fees_paid: number;
  first_transaction: string;
  last_transaction: string;
}

export interface WalletProgramUsage {
  program_id: string;
  total_invocations: number;
  total_cu_consumed: number;
  transaction_count: number;
}

export interface WalletTransaction {
  signature: string;
  slot: number;
  block_time: string;
  fee: number;
  status: string;
  compute_units_consumed: number;
  programs_invoked: string[];
  transaction_type: string;
  amount: number | null;
}

export interface WalletSearchResult {
  wallet_address: string;
  total_transactions: number;
  total_cu_consumed: number;
  total_fees_paid: number;
  blocks_interacted: number;
  first_interaction: string;
  last_interaction: string;
}

export const searchWallets = async (validatorQuery: string, timeRange = '24h', limit = 50000, defiPrograms?: string[]): Promise<WalletSearchResult[]> => {
  const response = await api.get('/api/wallets/search', {
    params: { 
      q: validatorQuery, 
      timeRange, 
      limit,
      defiPrograms: defiPrograms ? defiPrograms.join(',') : undefined
    },
  });
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getWalletStats = async (walletAddress: string, timeRange = '24h'): Promise<WalletStats[]> => {
  const response = await retryRequest(() => 
    api.get(`/api/wallets/${encodeURIComponent(walletAddress)}/stats`, {
      params: { timeRange },
    })
  );
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getWalletProgramUsage = async (walletAddress: string, timeRange = '24h'): Promise<WalletProgramUsage[]> => {
  const response = await retryRequest(() => 
    api.get(`/api/wallets/${encodeURIComponent(walletAddress)}/programs`, {
      params: { timeRange },
    })
  );
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getWalletTransactions = async (walletAddress: string, timeRange = '24h', limit = 10000): Promise<WalletTransaction[]> => {
  const response = await retryRequest(() => 
    api.get(`/api/wallets/${encodeURIComponent(walletAddress)}/transactions`, {
      params: { timeRange, limit },
    })
  );
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getTopWallets = async (timeRange = '24h', limit = 50000): Promise<WalletSearchResult[]> => {
  const response = await api.get('/api/wallets/top', {
    params: { timeRange, limit },
  });
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const triggerWalletIngestion = async (walletAddress: string, timeRange = '24h'): Promise<{ message: string; status: string }> => {
  const response = await api.get('/api/ingest-wallet', {
    params: { wallet: walletAddress, timeRange },
  });
  return response.data;
};

// Quick polling versions for wallets
export const getWalletStatsQuick = async (walletAddress: string, timeRange = '24h'): Promise<WalletStats[]> => {
  const response = await retryRequest(() => 
    apiQuick.get(`/api/wallets/${encodeURIComponent(walletAddress)}/stats`, {
      params: { timeRange },
    }), 2
  );
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getWalletProgramUsageQuick = async (walletAddress: string, timeRange = '24h'): Promise<WalletProgramUsage[]> => {
  const response = await retryRequest(() => 
    apiQuick.get(`/api/wallets/${encodeURIComponent(walletAddress)}/programs`, {
      params: { timeRange },
    }), 2
  );
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

// Blacklist API functions
export interface BlacklistedProgram {
  program_id: string;
  blacklisted_at: string;
  reason: string;
}

export const getBlacklistedPrograms = async (): Promise<BlacklistedProgram[]> => {
  const response = await api.get('/api/blacklist');
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const addToBlacklist = async (programId: string, reason: string = ''): Promise<{ success: boolean; message: string }> => {
  const response = await api.post('/api/blacklist', {
    program_id: programId,
    reason: reason,
  });
  return response.data;
};

export const removeFromBlacklist = async (programId: string): Promise<{ success: boolean; message: string }> => {
  const response = await api.delete(`/api/blacklist/${encodeURIComponent(programId)}`);
  return response.data;
};

export const isBlacklisted = async (programId: string): Promise<boolean> => {
  const response = await api.get(`/api/blacklist/check/${encodeURIComponent(programId)}`);
  return response.data.is_blacklisted;
};

export const clearBlacklist = async (): Promise<{ success: boolean; message: string }> => {
  const response = await api.delete('/api/blacklist');
  return response.data;
};

