import axios from 'axios';
import type { TestCase } from '@/types/testCase.types';
import type {
  ExecuteBatchTestRequest,
  ExecuteSingleTestRequest,
  TestCaseExecutionResult,
  TestSuiteExecutionResult,
} from '@/types/testExecution.types';
import { formatApiErrorMessage, TestExecutionApiError } from './apiError';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

export const testExecutionService = {
  async executeSingle(testCase: TestCase): Promise<TestCaseExecutionResult> {
    const payload: ExecuteSingleTestRequest = { testCase };
    try {
      const response = await axios.post<TestCaseExecutionResult>(
        `${API_BASE_URL}/api/tests/execute-single`,
        payload,
        { timeout: 35000 }
      );
      return response.data;
    } catch (error: unknown) {
      const message = formatApiErrorMessage(
        error,
        `Execution failed for test case "${testCase.name}".`
      );
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      throw new TestExecutionApiError(message, status);
    }
  },

  async executeBatch(testCases: TestCase[]): Promise<TestSuiteExecutionResult> {
    const payload: ExecuteBatchTestRequest = { testCases };
    try {
      const response = await axios.post<TestSuiteExecutionResult>(
        `${API_BASE_URL}/api/tests/execute-batch`,
        payload,
        { timeout: 120000 } // Extended timeout for sequential execution of batches
      );
      return response.data;
    } catch (error: unknown) {
      const message = formatApiErrorMessage(error, 'Batch test execution failed.');
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      throw new TestExecutionApiError(message, status);
    }
  },
};
