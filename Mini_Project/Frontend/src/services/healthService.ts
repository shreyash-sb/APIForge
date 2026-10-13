import axios from 'axios';
const base = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'http://localhost:3001';
export type HealthCheck = { status: 'Healthy' | 'Degraded' | 'Unavailable'; responseTime: string; error?: string };
export async function checkBackendHealth(): Promise<HealthCheck> {
  const started = performance.now();
  try { const response = await axios.get(`${base}/health`, { timeout: 5000 }); const ms = Math.round(performance.now() - started); return { status: response.status >= 200 && response.status < 300 ? (ms < 1000 ? 'Healthy' : 'Degraded') : 'Unavailable', responseTime: `${ms} ms` }; }
  catch (error) { return { status: 'Unavailable', responseTime: '—', error: axios.isAxiosError(error) && error.code === 'ECONNABORTED' ? 'Health check timed out.' : 'Health check failed.' }; }
}
