// Mirror of Backend/src/types/diagnosis.types.ts — frontend copy

export type AiProviderName = 'google-gemini' | 'mock';

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
  provider: AiProviderName;
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
}
