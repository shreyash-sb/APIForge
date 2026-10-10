import axios from 'axios';
import type { TestCase } from '@/types/testCase.types';
import type {
  ExecuteBatchTestRequest,
  ExecuteSingleTestRequest,
  TestCaseExecutionResult,
  TestSuiteExecutionResult,
} from '@/types/testExecution.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const testExecutionService = {
  async executeSingle(testCase: TestCase): Promise<TestCaseExecutionResult> {
    const payload: ExecuteSingleTestRequest = { testCase };
    const response = await axios.post<TestCaseExecutionResult>(
      `${API_BASE_URL}/api/tests/execute-single`,
      payload,
      { timeout: 35000 }
    );
    return response.data;
  },

  async executeBatch(testCases: TestCase[]): Promise<TestSuiteExecutionResult> {
    const payload: ExecuteBatchTestRequest = { testCases };
    const response = await axios.post<TestSuiteExecutionResult>(
      `${API_BASE_URL}/api/tests/execute-batch`,
      payload,
      { timeout: 120000 } // Extended timeout for sequential execution of batches
    );
    return response.data;
  },
};
