import axios from 'axios';

import { getApiBaseUrl } from '../config/api';

const base = getApiBaseUrl();

export type HealthCheck = {
  status: 'Healthy' | 'Degraded' | 'Unavailable';
  responseTime: string;
  error?: string;
  database?: 'connected' | 'in-memory';
  aiProvider?: string;
};

export async function checkBackendHealth(): Promise<HealthCheck> {
  const started = performance.now();
  try {
    const response = await axios.get(`${getApiBaseUrl()}/health`, { timeout: 5000 });
    const ms = Math.round(performance.now() - started);
    const data = response.data || {};
    return {
      status: response.status >= 200 && response.status < 300 ? (ms < 1000 ? 'Healthy' : 'Degraded') : 'Unavailable',
      responseTime: `${ms} ms`,
      database: data.database === 'connected' ? 'connected' : 'in-memory',
      aiProvider: data.aiProvider || 'mock',
    };
  } catch (error) {
    return {
      status: 'Unavailable',
      responseTime: '—',
      error: axios.isAxiosError(error) && error.code === 'ECONNABORTED' ? 'Health check timed out.' : 'Health check failed.',
    };
  }
}
