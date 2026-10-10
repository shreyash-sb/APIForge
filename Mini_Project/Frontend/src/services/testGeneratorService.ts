import axios from 'axios';
import type { TestGenerationRequest, TestSuite } from '@/types/testCase.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const testGeneratorService = {
  async generate(payload: TestGenerationRequest): Promise<TestSuite> {
    const response = await axios.post<TestSuite>(`${API_BASE_URL}/api/tests/generate`, payload, { timeout: 30000 });
    return response.data;
  },
};
