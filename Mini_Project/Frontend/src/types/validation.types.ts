import type { ApiSchema } from './openapi.types';
import type { TestCase } from './testCase.types';
import type { TestCaseExecutionResult } from './testExecution.types';

export type ValidationStatus =
  | 'VALIDATION_PASSED'
  | 'VALIDATION_FAILED'
  | 'NOT_VALIDATABLE'
  | 'SKIPPED';

export type AssertionCategory =
  | 'STATUS_CODE'
  | 'HEADER'
  | 'CONTENT_TYPE'
  | 'SCHEMA_TYPE'
  | 'SCHEMA_REQUIRED'
  | 'SCHEMA_CONSTRAINT'
  | 'SCHEMA_ENUM'
  | 'SCHEMA_STRUCTURE';

export interface AssertionResult {
  id: string;
  category: AssertionCategory;
  path: string;
  expected: string;
  actual: string;
  passed: boolean;
  message: string;
}

export interface TestCaseValidationResult {
  testCaseId: string;
  executionId: string;
  status: ValidationStatus;
  validatedAt: string;
  durationMs: number;
  summary: {
    totalAssertions: number;
    passedAssertions: number;
    failedAssertions: number;
  };
  assertions: AssertionResult[];
}

export interface TestSuiteValidationSummary {
  totalTests: number;
  validatedTests: number;
  passedValidation: number;
  failedValidation: number;
  notValidatable: number;
  skipped: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  totalDurationMs: number;
}

export interface TestSuiteValidationResult {
  validationSuiteId: string;
  validatedAt: string;
  summary: TestSuiteValidationSummary;
  results: TestCaseValidationResult[];
}

export interface ValidateSingleRequest {
  testCase: TestCase;
  executionResult: TestCaseExecutionResult;
  schemas?: Record<string, ApiSchema>;
}

export interface ValidateBatchItem {
  testCase: TestCase;
  executionResult: TestCaseExecutionResult;
}

export interface ValidateBatchRequest {
  items: ValidateBatchItem[];
  schemas?: Record<string, ApiSchema>;
}

export const MAX_VALIDATION_BATCH_SIZE = 100;
