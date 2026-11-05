/** Shared backend URL configuration for frontend API endpoints. */
const rawUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  '';

const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

export const API_BASE_URL = (
  rawUrl || (isDev ? 'http://localhost:3001' : 'https://apiforge-production-cb58.up.railway.app')
).replace(/\/+$/, '');

/** Build the backend mock-serving URL without duplicate or trailing separators. */
export function getMockServeBaseUrl(apiBaseUrl = API_BASE_URL): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/api/mock/serve`;
}
