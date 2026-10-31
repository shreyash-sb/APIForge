import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

/** Fired when APIForge's own backend rejects the stored session (expired, revoked, or server restarted). */
export const SESSION_EXPIRED_EVENT = 'apiforge:session-expired';

// Credential-entry endpoints answer 401 for wrong passwords; that is not an expired session.
const CREDENTIAL_ENDPOINTS = /\/api\/auth\/(login|signup|logout)\b/;

function onResponseError(error: AxiosError): Promise<never> {
  const url = String(error.config?.url ?? '');
  const sentToken = Boolean(error.config?.headers?.get?.('Authorization'));
  // Target-API results are wrapped in HTTP 200 by the executor, so a 401 here always
  // comes from APIForge's own authentication middleware.
  if (error.response?.status === 401 && sentToken && url.includes('/api/') && !CREDENTIAL_ENDPOINTS.test(url)) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return Promise.reject(error);
}

function addSessionToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (typeof localStorage === 'undefined') return config;
  try {
    const serialized = localStorage.getItem('apiforge-auth-session');
    if (!serialized) return config;
    const token = JSON.parse(serialized)?.state?.token;
    if (typeof token === 'string' && token.length > 0) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
  } catch {
    // Ignore corrupted local session state; protected APIs will return 401.
  }
  return config;
}

export function installAuthInterceptor(client: AxiosInstance): void {
  client.interceptors.request.use(addSessionToken);
  client.interceptors.response.use(undefined, onResponseError);
}

// Most service modules use the shared Axios singleton.
installAuthInterceptor(axios);
