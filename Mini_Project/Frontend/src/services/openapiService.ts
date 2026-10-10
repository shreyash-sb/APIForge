import axios from 'axios';
import type { OpenApiImportResult } from '@/types/openapi.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const openApiService = {
  async importSpecification(fileName: string, content: string): Promise<OpenApiImportResult> {
    try {
      const response = await axios.post<OpenApiImportResult>(`${API_BASE_URL}/api/openapi/import`, { fileName, content }, { timeout: 30000 });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) return error.response.data as OpenApiImportResult;
      return { success: false, error: { message: 'Could not reach the APIForge backend. Make sure it is running.' } };
    }
  },
};
