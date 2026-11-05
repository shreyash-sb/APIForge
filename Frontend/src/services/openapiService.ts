import axios from 'axios';
import type { OpenApiImportResult } from '@/types/openapi.types';
import { formatApiErrorMessage } from './apiError';
import { getApiBaseUrl } from '../config/api';

export const openApiService = {
  async importSpecification(fileName: string, content: string): Promise<OpenApiImportResult> {
    try {
      const response = await axios.post<OpenApiImportResult>(
        `${getApiBaseUrl()}/api/openapi/import`,
        { fileName, content },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.data &&
        typeof error.response.data === 'object' &&
        'success' in error.response.data
      ) {
        return error.response.data as OpenApiImportResult;
      }
      return {
        success: false,
        error: {
          message: formatApiErrorMessage(
            error,
            'Could not reach the APIForge backend. Make sure it is running.'
          ),
        },
      };
    }
  },
};
