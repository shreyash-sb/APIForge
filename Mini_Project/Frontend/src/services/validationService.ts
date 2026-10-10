import axios from 'axios';
import type { ApiSchema } from '@/types/openapi.types';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type {
  TestCaseValidationResult,
  TestSuiteValidationResult,
  ValidateBatchItem,
  ValidateBatchRequest,
  ValidateSingleRequest,
} from '@/types/validation.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class ValidationApiError extends Error {
  public statusCode?: number;
  public details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = 'ValidationApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const validationService = {
  async validateSingle(
    testCase: TestCase,
    executionResult: TestCaseExecutionResult,
    schemas?: Record<string, ApiSchema>
  ): Promise<TestCaseValidationResult> {
    const payload: ValidateSingleRequest = { testCase, executionResult, schemas };

    try {
      const response = await axios.post<TestCaseValidationResult>(
        `${API_BASE_URL}/api/validation/validate-single`,
        payload,
        { timeout: 30000 }
      );
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: { message?: string } })?.error?.message ||
          error.message ||
          'Failed to perform response contract validation.';
        throw new ValidationApiError(message, error.response?.status, error.response?.data);
      }
      throw new ValidationApiError(
        error instanceof Error ? error.message : 'Unknown validation error occurred.'
      );
    }
  },

  async validateBatch(
    items: ValidateBatchItem[],
    schemas?: Record<string, ApiSchema>
  ): Promise<TestSuiteValidationResult> {
    const payload: ValidateBatchRequest = { items, schemas };

    try {
      const response = await axios.post<TestSuiteValidationResult>(
        `${API_BASE_URL}/api/validation/validate-batch`,
        payload,
        { timeout: 90000 } // Extended timeout for batch validation
      );
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message =
          (error.response?.data as { error?: { message?: string } })?.error?.message ||
          error.message ||
          'Failed to perform batch response contract validation.';
        throw new ValidationApiError(message, error.response?.status, error.response?.data);
      }
      throw new ValidationApiError(
        error instanceof Error ? error.message : 'Unknown batch validation error occurred.'
      );
    }
  },
};
