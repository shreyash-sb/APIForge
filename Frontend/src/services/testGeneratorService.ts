import axios from 'axios';
import type { TestGenerationRequest, TestSuite } from '@/types/testCase.types';
import { formatApiErrorMessage, TestGeneratorApiError } from './apiError';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

export const testGeneratorService = {
  async generate(payload: TestGenerationRequest): Promise<TestSuite> {
    try {
      const response = await axios.post<TestSuite>(`${API_BASE_URL}/api/tests/generate`, payload, {
        timeout: 30000,
      });
      return response.data;
    } catch (error: unknown) {
      const message = formatApiErrorMessage(error, 'Test generation failed.');
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      throw new TestGeneratorApiError(message, status);
    }
  },
};
