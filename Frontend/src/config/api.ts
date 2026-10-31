/** Shared backend URL configuration for frontend API endpoints. */
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

/** Build the backend mock-serving URL without duplicate or trailing separators. */
export function getMockServeBaseUrl(apiBaseUrl = API_BASE_URL): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/api/mock/serve`;
}
