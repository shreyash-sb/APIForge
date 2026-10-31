import type { TestCase } from './testCase.types.js';
import type { TestCaseExecutionResult } from './testExecution.types.js';
import type { TestCaseValidationResult } from './validation.types.js';

// ---------------------------------------------------------------------------
// AI Provider abstraction
// ---------------------------------------------------------------------------

export type AiProviderName = 'google-gemini' | 'mock';

/**
 * live     — the answer was produced by Gemini using the user's own key
 * mock     — demo mode (no user key configured); deterministic, not a live LLM
 * fallback — Gemini was attempted but failed; deterministic output was used instead
 */
export type AiProviderStatus = 'live' | 'mock' | 'fallback';

// ---------------------------------------------------------------------------
// Sanitized evidence passed into the AI (no secrets / tokens)
// ---------------------------------------------------------------------------

export interface SanitizedEvidence {
  testCase: {
    id: string;
    name: string;
    description: string;
    type: string;
    priority: string;
    endpoint: { method: string; path: string };
    expected: {
      statusCodes?: string[];
      statusClass?: string;
      conditions?: string[];
    };
  };
  execution: {
    status: string;
    durationMs: number;
    response?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      /** Body truncated to MAX_BODY_EXCERPT_BYTES characters */
      bodyExcerpt: string | null;
      size: number;
    };
    error?: string;
  };
  validation: {
    status: string;
    summary: {
      totalAssertions: number;
      passedAssertions: number;
      failedAssertions: number;
    };
    failedAssertions: Array<{
      category: string;
      path: string;
      expected: string;
      actual: string;
      message: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Diagnosis severity
// ---------------------------------------------------------------------------

export type DiagnosisSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

// ---------------------------------------------------------------------------
// A single finding produced by the AI
// ---------------------------------------------------------------------------

export interface DiagnosisFinding {
  /** Unique ID for the finding, e.g. "finding_0" */
  id: string;
  /** Short one-liner title */
  title: string;
  /** Full explanation */
  explanation: string;
  /** Severity level */
  severity: DiagnosisSeverity;
  /** Suggested remediation / next action */
  suggestion: string;
  /** The assertion id this finding relates to, if applicable */
  relatedAssertionId?: string;
}

// ---------------------------------------------------------------------------
// Overall AI confidence in its diagnosis
// ---------------------------------------------------------------------------

export type DiagnosisConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

// ---------------------------------------------------------------------------
// The complete result returned by DiagnosisService
// ---------------------------------------------------------------------------

export interface DiagnosisResult {
  diagnosisId: string;
  testCaseId: string;
  executionId: string;
  diagnosedAt: string;
  durationMs: number;
  /** The provider that actually produced this content (mock for demo or fallback output) */
  provider: AiProviderName;
  /** Whether the content is live Gemini output, demo/mock output, or a deterministic fallback */
  providerStatus?: AiProviderStatus;
  /** Classified reason Gemini output was not used (fallback only); never includes credentials */
  fallbackReason?: string;
  /** Phase 6 validation status — NOT overridden by AI */
  validationStatus: string;
  confidence: DiagnosisConfidence;
  summary: string;
  findings: DiagnosisFinding[];
  /** Raw prompt sent to the AI (present only in development) */
  promptExcerpt?: string;
}

// ---------------------------------------------------------------------------
// API request bodies
// ---------------------------------------------------------------------------

export interface DiagnoseSingleRequest {
  testCase: TestCase;
  executionResult: TestCaseExecutionResult;
  validationResult: TestCaseValidationResult;
}

export interface DiagnoseBatchItem {
  testCase: TestCase;
  executionResult: TestCaseExecutionResult;
  validationResult: TestCaseValidationResult;
}

export interface DiagnoseBatchRequest {
  items: DiagnoseBatchItem[];
}

// ---------------------------------------------------------------------------
// Batch result
// ---------------------------------------------------------------------------

export interface DiagnoseBatchResult {
  batchId: string;
  diagnosedAt: string;
  totalDurationMs: number;
  results: DiagnosisResult[];
  /** Items that could not be diagnosed; successful results are still returned */
  failures?: DiagnoseBatchFailure[];
}

export interface DiagnoseBatchFailure {
  testCaseId: string;
  executionId: string;
  message: string;
}

export const MAX_DIAGNOSIS_BATCH_SIZE = 20;
export const MAX_BODY_EXCERPT_BYTES = 2000;
