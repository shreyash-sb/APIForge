// Mirror of Backend/src/types/diagnosis.types.ts — frontend copy

export type AiProviderName = 'google-gemini' | 'mock';

/** live = Gemini answered with the user's key; mock = demo mode; fallback = Gemini failed, deterministic output used */
export type AiProviderStatus = 'live' | 'mock' | 'fallback';

export type DiagnosisSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type DiagnosisConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DiagnosisFinding {
  id: string;
  title: string;
  explanation: string;
  severity: DiagnosisSeverity;
  suggestion: string;
  relatedAssertionId?: string;
}

export interface DiagnosisResult {
  diagnosisId: string;
  testCaseId: string;
  executionId: string;
  diagnosedAt: string;
  durationMs: number;
  /** The provider that actually produced the content (mock for demo or fallback output) */
  provider: AiProviderName;
  providerStatus?: AiProviderStatus;
  fallbackReason?: string;
  /** Phase 6 validation status — NEVER overridden by AI */
  validationStatus: string;
  confidence: DiagnosisConfidence;
  summary: string;
  findings: DiagnosisFinding[];
  promptExcerpt?: string;
}

export interface DiagnoseSingleRequest {
  testCase: import('./testCase.types').TestCase;
  executionResult: import('./testExecution.types').TestCaseExecutionResult;
  validationResult: import('./validation.types').TestCaseValidationResult;
}

export interface DiagnoseBatchItem {
  testCase: import('./testCase.types').TestCase;
  executionResult: import('./testExecution.types').TestCaseExecutionResult;
  validationResult: import('./validation.types').TestCaseValidationResult;
}

export interface DiagnoseBatchResult {
  batchId: string;
  diagnosedAt: string;
  totalDurationMs: number;
  results: DiagnosisResult[];
  failures?: DiagnoseBatchFailure[];
}

export interface DiagnoseBatchFailure {
  testCaseId: string;
  executionId: string;
  message: string;
}

/** Mirrors the backend MAX_DIAGNOSIS_BATCH_SIZE limit. */
export const MAX_DIAGNOSIS_BATCH_SIZE = 20;
