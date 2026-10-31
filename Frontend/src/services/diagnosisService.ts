import axios from 'axios';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type {
  DiagnoseBatchItem,
  DiagnoseBatchResult,
  DiagnosisResult,
} from '@/types/diagnosis.types';
import { formatApiErrorMessage } from './apiError';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

export class DiagnosisApiError extends Error {
  public statusCode?: number;
  public details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = 'DiagnosisApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const diagnosisService = {
  async diagnoseSingle(
    testCase: TestCase,
    executionResult: TestCaseExecutionResult,
    validationResult: TestCaseValidationResult
  ): Promise<DiagnosisResult> {
    try {
      const response = await axios.post<DiagnosisResult>(
        `${API_BASE_URL}/api/diagnosis/diagnose-single`,
        { testCase, executionResult, validationResult },
        { timeout: 60000 }
      );
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = formatApiErrorMessage(error, 'AI diagnosis request failed.');
        throw new DiagnosisApiError(message, error.response?.status, error.response?.data);
      }
      throw new DiagnosisApiError(
        error instanceof Error ? error.message : 'Unknown AI diagnosis error occurred.'
      );
    }
  },

  async diagnoseBatch(items: DiagnoseBatchItem[], signal?: AbortSignal): Promise<DiagnoseBatchResult> {
    try {
      const response = await axios.post<DiagnoseBatchResult>(
        `${API_BASE_URL}/api/diagnosis/diagnose-batch`,
        { items },
        { timeout: 180000, signal } // Each case is a sequential AI call on the server
      );
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = formatApiErrorMessage(error, 'AI batch diagnosis request failed.');
        throw new DiagnosisApiError(message, error.response?.status, error.response?.data);
      }
      throw new DiagnosisApiError(
        error instanceof Error ? error.message : 'Unknown AI batch diagnosis error occurred.'
      );
    }
  },
};
