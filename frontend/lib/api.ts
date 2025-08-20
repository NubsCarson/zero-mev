import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
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
  avg_percentage: number;
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

export const getValidatorStats = async (validatorId: string, timeRange = '24h'): Promise<ValidatorStats[]> => {
  const response = await api.get(`/api/validators/${encodeURIComponent(validatorId)}/stats`, {
    params: { timeRange },
  });
  // Handle ClickHouse response format
  if (response.data && response.data.data) {
    return response.data.data;
  }
  return response.data;
};

export const getValidatorProgramUsage = async (validatorId: string, timeRange = '24h'): Promise<ProgramUsage[]> => {
  const response = await api.get(`/api/validators/${encodeURIComponent(validatorId)}/programs`, {
    params: { timeRange },
  });
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