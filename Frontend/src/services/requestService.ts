import axios from 'axios';
import type { ApiRequest, ApiExecutionResult } from '@/types/request.types';
import { formatApiErrorMessage } from './apiError';
import { getApiBaseUrl } from '../config/api';
import { useAppStore } from '@/store/useAppStore';

export class RequestService {
  async executeRequest(request: ApiRequest): Promise<ApiExecutionResult> {
    try {
      const timeoutMs = useAppStore.getState().requestTimeoutMs;
      // The backend enforces the user's timeout on the outbound call; the browser waits a
      // little longer so it receives the backend's structured timeout result.
      const response = await axios.post<ApiExecutionResult>(
        `${getApiBaseUrl()}/api/requests/execute`,
        { ...request, timeoutMs },
        {
          timeout: timeoutMs + 5000,
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          return {
            success: false,
            error: {
              type: 'TIMEOUT',
              message: 'Request to backend timed out. Please check backend responsiveness.',
            },
          };
        }

        if (error.code === 'ERR_NETWORK') {
          return {
            success: false,
            error: {
              type: 'NETWORK_ERROR',
              message: 'Cannot connect to backend server. Make sure it is running.',
            },
          };
        }

        const data = error.response?.data as { success?: boolean; error?: unknown } | undefined;
        if (data && typeof data === 'object' && 'success' in data) {
          // Normalize { error: "message" } (auth middleware) into the structured error shape
          // so the response panel never renders an empty error.
          if (typeof data.error === 'string' || !data.error) {
            return {
              success: false,
              error: {
                type: error.response?.status === 401 ? 'AUTH_ERROR' : 'UNKNOWN_ERROR',
                message: formatApiErrorMessage(error, 'Request failed.'),
              },
            } as ApiExecutionResult;
          }
          return data as ApiExecutionResult;
        }

        return {
          success: false,
          error: {
            type: 'UNKNOWN_ERROR',
            message: formatApiErrorMessage(error, 'HTTP error executing request.'),
            details: error.message,
          },
        };
      }

      return {
        success: false,
        error: {
          type: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

export const requestService = new RequestService();
