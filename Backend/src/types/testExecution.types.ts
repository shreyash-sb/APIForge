import type { ApiRequest, ApiResponse, ApiErrorResponse, QueryParam, Header } from './request.types.js';
import type { TestCase } from './testCase.types.js';

export type TestExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED_EXECUTION'
  | 'FAILED_EXECUTION'
  | 'ERROR'
  | 'SKIPPED';

export interface SanitizedApiRequest {
  method: ApiRequest['method'];
  url: string;
  queryParams?: QueryParam[];
  headers?: Header[];
  body?: string | null;
  auth: {
    type: ApiRequest['auth']['type'];
    redacted: boolean;
    description: string;
  };
}

export interface TestCaseExecutionResult {
  testCaseId: string;
  executionId: string;
  status: TestExecutionStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  request: SanitizedApiRequest;
  response?: ApiResponse;
  error?: ApiErrorResponse['error'];
}

export interface TestExecutionSummary {
  total: number;
  executed: number;
  passedExecution: number;
  failedExecution: number;
  errors: number;
  skipped: number;
  totalDurationMs: number;
}

export interface TestSuiteExecutionResult {
  suiteExecutionId: string;
  startedAt: string;
  completedAt: string;
  summary: TestExecutionSummary;
  results: TestCaseExecutionResult[];
}

export interface ExecuteSingleTestRequest {
  testCase: TestCase;
}

export interface ExecuteBatchTestRequest {
  testCases: TestCase[];
}

export const MAX_BATCH_SIZE = 100;
