/**
 * Shared backend URL configuration for frontend API endpoints.
 * Handles cleaning of accidental parentheses/quotes from environment variables.
 */

export function normalizeApiUrl(raw?: string | null): string {
  if (!raw) return '';
  let cleaned = String(raw).trim();
  // Strip surrounding quotes, parentheses, brackets, angle brackets, and trailing slashes
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(/^[\s"'`()<>{}\[\]]+|[\s"'`()<>{}\[\]]+$/g, '');
    cleaned = cleaned.replace(/\/+$/, '');
  }
  return cleaned;
}

const rawEnvUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  '';

const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

const cleanedEnv = normalizeApiUrl(rawEnvUrl);

export const API_BASE_URL =
  cleanedEnv || (isDev ? 'http://localhost:3001' : 'https://apiforge-production-cb58.up.railway.app');

/** Dynamic getter that always reads the latest/cleaned base URL */
export function getApiBaseUrl(): string {
  const currentRaw =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
    '';
  const cleaned = normalizeApiUrl(currentRaw);
  return cleaned || API_BASE_URL;
}

/** Build the backend mock-serving URL without duplicate or trailing separators. */
export function getMockServeBaseUrl(apiBaseUrl = getApiBaseUrl()): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/api/mock/serve`;
}
