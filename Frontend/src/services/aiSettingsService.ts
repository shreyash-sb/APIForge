import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import { formatApiErrorMessage } from './apiError';

/**
 * Safe metadata about the user's session-only Gemini key. The key itself is
 * never returned by the backend and is never stored by the frontend.
 */
export interface AiKeyStatus {
  provider: 'google-gemini';
  configured: boolean;
  keyHint?: string;
  storage: 'session';
  configuredAt?: string;
  expiresAt?: string;
  model: string;
  mode: 'gemini' | 'mock-demo';
  lastValidation?: { status: 'valid' | 'invalid' | 'unverified'; checkedAt: string; message: string };
}

export class AiSettingsApiError extends Error {
  constructor(message: string, readonly status?: AiKeyStatus) {
    super(message);
    this.name = 'AiSettingsApiError';
  }
}

const url = (path = '') => `${API_BASE_URL}/api/ai-settings${path}`;

function toError(error: unknown, fallback: string): AiSettingsApiError {
  const status = axios.isAxiosError(error) ? (error.response?.data as { status?: AiKeyStatus } | undefined)?.status : undefined;
  return new AiSettingsApiError(formatApiErrorMessage(error, fallback), status);
}

export const aiSettingsService = {
  async getStatus(): Promise<AiKeyStatus> {
    try {
      return (await axios.get<AiKeyStatus>(url(), { timeout: 10000 })).data;
    } catch (error) {
      throw toError(error, 'Unable to load AI provider status.');
    }
  },

  /** Sends the key once over the authenticated API connection; the backend validates and keeps it for this session. */
  async saveGeminiKey(apiKey: string): Promise<AiKeyStatus> {
    try {
      return (await axios.put<AiKeyStatus>(url('/gemini-key'), { apiKey }, { timeout: 20000 })).data;
    } catch (error) {
      throw toError(error, 'Unable to save the Gemini API key.');
    }
  },

  async testGeminiKey(): Promise<AiKeyStatus> {
    try {
      return (await axios.post<AiKeyStatus>(url('/gemini-key/test'), {}, { timeout: 20000 })).data;
    } catch (error) {
      throw toError(error, 'Unable to test the Gemini API key.');
    }
  },

  async removeGeminiKey(): Promise<AiKeyStatus> {
    try {
      return (await axios.delete<AiKeyStatus>(url('/gemini-key'), { timeout: 10000 })).data;
    } catch (error) {
      throw toError(error, 'Unable to remove the Gemini API key.');
    }
  },
};

/** Short label describing where AI output will come from. */
export function describeAiMode(status: AiKeyStatus | undefined): string {
  if (!status) return 'AI provider status unavailable';
  return status.configured ? `Gemini (your key ${status.keyHint ?? ''})`.trim() : 'Mock/demo mode — no Gemini key configured';
}
