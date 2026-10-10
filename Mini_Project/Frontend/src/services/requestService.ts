import axios from 'axios';
import type { ApiRequest, ApiExecutionResult } from '@/types/request.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class RequestService {
  async executeRequest(request: ApiRequest): Promise<ApiExecutionResult> {
    try {
      const response = await axios.post<ApiExecutionResult>(
        `${API_BASE_URL}/api/requests/execute`,
        request,
        {
          timeout: 35000, // Slightly longer than backend timeout
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
              message: 'Request to backend timed out',
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

        if (error.response?.data) {
          return error.response.data as ApiExecutionResult;
        }
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
