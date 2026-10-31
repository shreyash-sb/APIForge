import axios from 'axios';

/**
 * Strips sensitive values like tokens, passwords, and authorization keys from error strings.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return '';
  return message
    .replace(/(bearer\s+)[a-zA-Z0-9_\-.=]+/gi, '$1[REDACTED]')
    .replace(/((?:token|password|key|apiKey|secret)=)[^&\s]+/gi, '$1[REDACTED]');
}

/**
 * Formats any caught error into a clear, actionable user-facing message.
 */
export function formatApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!error) return fallbackMessage;

  if (axios.isAxiosError(error)) {
    // 1. Timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'The request timed out. Please check backend responsiveness and try again.';
    }

    // 2. Network connectivity / server unavailable
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || !error.response) {
      return 'Unable to reach backend service at http://localhost:3001. Ensure the APIForge backend is running.';
    }

    // 3. Response error payload from APIForge backend
    const data = error.response.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object') {
      const errObj = data.error as { message?: string; details?: unknown } | undefined;
      if (errObj && typeof errObj.message === 'string' && errObj.message.trim()) {
        return sanitizeErrorMessage(errObj.message);
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return sanitizeErrorMessage(data.message);
      }
      // Some backend routes (e.g. auth middleware) return { error: "message" }.
      if (typeof data.error === 'string' && data.error.trim()) {
        return sanitizeErrorMessage(data.error);
      }
    }

    // 4. HTTP status codes
    const status = error.response.status;
    if (status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (status === 400) {
      return 'Bad request. Please verify the request parameters and specification format.';
    }
    if (status === 404) {
      return 'The requested APIForge endpoint or resource was not found.';
    }
    if (status === 502 || status === 503 || status === 504) {
      return `Backend gateway error (HTTP ${status}). The service is currently unreachable or overloaded.`;
    }
    if (status >= 500) {
      return `Internal backend error (HTTP ${status}). Check server logs for details.`;
    }

    return sanitizeErrorMessage(error.message || fallbackMessage);
  }

  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message || fallbackMessage);
  }

  if (typeof error === 'string') {
    return sanitizeErrorMessage(error);
  }

  return fallbackMessage;
}

export class TestExecutionApiError extends Error {
  readonly statusCode?: number;
  readonly details?: unknown;
  constructor(message: string, statusCode?: number, details?: unknown) {
    super(sanitizeErrorMessage(message));
    this.name = 'TestExecutionApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class TestGeneratorApiError extends Error {
  readonly statusCode?: number;
  readonly details?: unknown;
  constructor(message: string, statusCode?: number, details?: unknown) {
    super(sanitizeErrorMessage(message));
    this.name = 'TestGeneratorApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
