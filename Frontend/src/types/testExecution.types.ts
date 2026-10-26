import type { ApiResponse, ApiErrorResponse, Auth, HttpMethod } from './request.types';
import type { TestCase } from './testCase.types';

export type TestExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED_EXECUTION'
  | 'FAILED_EXECUTION'
  | 'ERROR'
  | 'SKIPPED';

export interface SanitizedApiRequest {
  method: HttpMethod;
  url: string;
  queryParams?: Array<{ key: string; value: string; enabled: boolean }>;
  headers?: Array<{ key: string; value: string; enabled: boolean }>;
  body?: string | null;
  auth: {
    type: Auth['type'];
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
