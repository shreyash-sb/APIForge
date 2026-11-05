import axios from 'axios';
import type { TestGenerationRequest, TestSuite } from '@/types/testCase.types';
import { formatApiErrorMessage, TestGeneratorApiError } from './apiError';
import { getApiBaseUrl } from '../config/api';

export const testGeneratorService = {
  async generate(payload: TestGenerationRequest): Promise<TestSuite> {
    try {
      const response = await axios.post<TestSuite>(`${getApiBaseUrl()}/api/tests/generate`, payload, {
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
