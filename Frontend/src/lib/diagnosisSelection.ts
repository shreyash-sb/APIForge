import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type { DiagnoseBatchItem, DiagnoseBatchResult, DiagnosisResult } from '@/types/diagnosis.types';
import { MAX_DIAGNOSIS_BATCH_SIZE } from '@/types/diagnosis.types';

/**
 * Report-side AI diagnosis selection.
 *
 * Eligible (sent to the provider):
 *  - execution FAILED_EXECUTION or ERROR
 *  - validation VALIDATION_FAILED with at least one failed assertion
 * Not eligible (no provider request is spent):
 *  - passing cases, SKIPPED/PENDING/RUNNING or unexecuted tests
 *  - NOT_VALIDATABLE/SKIPPED validation on a successful execution (nothing failed deterministically)
 *  - validation records that belong to a different execution (stale)
 *  - cases that already have a diagnosis for the current execution (unless re-diagnosis is requested)
 */

export type DiagnosisEligibility =
  | { eligible: true; reason: 'execution-failure' | 'validation-failure' }
  | { eligible: false; reason: 'passed' | 'not-executed' | 'no-failed-assertions' | 'stale-validation' | 'already-diagnosed' };

const MAX_EVIDENCE_BODY_CHARS = 4000;

export function classifyDiagnosisEligibility(
  execution: TestCaseExecutionResult | undefined,
  validation: TestCaseValidationResult | undefined,
  diagnosis?: DiagnosisResult
): DiagnosisEligibility {
  if (!execution || !['PASSED_EXECUTION', 'FAILED_EXECUTION', 'ERROR'].includes(execution.status)) {
    return { eligible: false, reason: 'not-executed' };
  }
  if (diagnosis && diagnosis.executionId === execution.executionId) return { eligible: false, reason: 'already-diagnosed' };
  if (execution.status === 'FAILED_EXECUTION' || execution.status === 'ERROR') return { eligible: true, reason: 'execution-failure' };
  if (!validation) return { eligible: false, reason: 'no-failed-assertions' };
  if (validation.executionId !== execution.executionId) return { eligible: false, reason: 'stale-validation' };
  if (validation.status === 'VALIDATION_FAILED' && validation.assertions.some((assertion) => !assertion.passed)) {
    return { eligible: true, reason: 'validation-failure' };
  }
  return { eligible: false, reason: validation.status === 'VALIDATION_PASSED' ? 'passed' : 'no-failed-assertions' };
}

/** Keeps only diagnoses that belong to a current test AND its current execution. */
export function currentDiagnosisResults(
  tests: TestCase[],
  executionResults: Record<string, TestCaseExecutionResult>,
  diagnosisResults: Record<string, DiagnosisResult>
): Record<string, DiagnosisResult> {
  const current: Record<string, DiagnosisResult> = {};
  for (const test of tests) {
    const diagnosis = diagnosisResults[test.id];
    const execution = executionResults[test.id];
    if (diagnosis && execution && diagnosis.testCaseId === test.id && diagnosis.executionId === execution.executionId) {
      current[test.id] = diagnosis;
    }
  }
  return current;
}

/** Minimal evidence: no request headers/auth, response body truncated. Backend sanitization still applies. */
function minimalEvidence(test: TestCase, execution: TestCaseExecutionResult, validation: TestCaseValidationResult | undefined): DiagnoseBatchItem {
  let body = execution.response?.body;
  if (body !== undefined && body !== null) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    if (raw.length > MAX_EVIDENCE_BODY_CHARS) body = `${raw.slice(0, MAX_EVIDENCE_BODY_CHARS)}…`;
  }
  const currentValidation: TestCaseValidationResult =
    validation && validation.executionId === execution.executionId
      ? validation
      : {
          // Execution failures without a validation record are diagnosed as NOT_VALIDATABLE evidence.
          testCaseId: test.id,
          executionId: execution.executionId,
          status: 'NOT_VALIDATABLE',
          validatedAt: execution.completedAt,
          durationMs: 0,
          summary: { totalAssertions: 0, passedAssertions: 0, failedAssertions: 0 },
          assertions: [],
        };
  return {
    testCase: {
      ...test,
      request: { ...test.request, headers: [], queryParams: [], body: null, auth: { type: 'none' } },
    },
    executionResult: {
      ...execution,
      request: { method: execution.request.method, url: '', auth: { type: execution.request.auth.type, redacted: true, description: 'Omitted from AI evidence' } },
      response: execution.response ? { ...execution.response, headers: { 'content-type': execution.response.headers?.['content-type'] ?? '' }, body } : undefined,
    },
    validationResult: currentValidation,
  };
}

export function selectEligibleDiagnosisItems(
  tests: TestCase[],
  executionResults: Record<string, TestCaseExecutionResult>,
  validationResults: Record<string, TestCaseValidationResult>,
  diagnosisResults: Record<string, DiagnosisResult>,
  options: { onlyTestIds?: string[] } = {}
): DiagnoseBatchItem[] {
  const only = options.onlyTestIds ? new Set(options.onlyTestIds) : undefined;
  return tests
    .filter((test) => !only || only.has(test.id))
    .filter((test) => classifyDiagnosisEligibility(executionResults[test.id], validationResults[test.id], diagnosisResults[test.id]).eligible)
    .map((test) => minimalEvidence(test, executionResults[test.id], validationResults[test.id]));
}

export function chunkItems<T>(items: T[], size = MAX_DIAGNOSIS_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Cases per request from the browser. The backend accepts up to MAX_DIAGNOSIS_BATCH_SIZE,
 * but each case is a sequential Gemini call (several seconds with a thinking model), so
 * smaller batches keep every request well inside the HTTP timeout and update progress often.
 */
export const CLIENT_DIAGNOSIS_BATCH_SIZE = 5;

export interface DiagnosisRunProgress {
  done: number;
  total: number;
}

export interface DiagnosisRunOutcome {
  accepted: DiagnosisResult[];
  failedTestIds: string[];
  cancelled: boolean;
  errors: string[];
}

/**
 * Runs bounded sequential batches. Successful results are reported per batch via
 * onResults so partial progress is never lost; returned results that do not match
 * the requested test/execution pair are discarded.
 */
export async function runDiagnosisBatches(
  items: DiagnoseBatchItem[],
  diagnoseBatch: (batch: DiagnoseBatchItem[], signal: AbortSignal) => Promise<DiagnoseBatchResult>,
  options: {
    signal: AbortSignal;
    onProgress?: (progress: DiagnosisRunProgress) => void;
    onResults?: (results: DiagnosisResult[]) => void;
    shouldStop?: (error: unknown) => boolean;
    batchSize?: number;
  }
): Promise<DiagnosisRunOutcome> {
  const outcome: DiagnosisRunOutcome = { accepted: [], failedTestIds: [], cancelled: false, errors: [] };
  let done = 0;
  const batches = chunkItems(items, Math.min(options.batchSize ?? CLIENT_DIAGNOSIS_BATCH_SIZE, MAX_DIAGNOSIS_BATCH_SIZE));
  options.onProgress?.({ done, total: items.length });

  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    if (options.signal.aborted) {
      outcome.cancelled = true;
      for (const remaining of batches.slice(index).flat()) outcome.failedTestIds.push(remaining.testCase.id);
      break;
    }
    const expected = new Map(batch.map((item) => [item.testCase.id, item.executionResult.executionId]));
    try {
      const response = await diagnoseBatch(batch, options.signal);
      const accepted = (response.results ?? []).filter((result) => expected.get(result.testCaseId) === result.executionId);
      const acceptedIds = new Set(accepted.map((result) => result.testCaseId));
      for (const id of expected.keys()) if (!acceptedIds.has(id)) outcome.failedTestIds.push(id);
      outcome.accepted.push(...accepted);
      if (accepted.length) options.onResults?.(accepted);
    } catch (error) {
      if (options.signal.aborted) {
        outcome.cancelled = true;
        for (const remaining of batches.slice(index).flat()) outcome.failedTestIds.push(remaining.testCase.id);
        break;
      }
      outcome.errors.push(error instanceof Error ? error.message : 'Diagnosis batch failed.');
      outcome.failedTestIds.push(...expected.keys());
      if (options.shouldStop?.(error)) {
        for (const remaining of batches.slice(index + 1).flat()) outcome.failedTestIds.push(remaining.testCase.id);
        break;
      }
    }
    done += batch.length;
    options.onProgress?.({ done, total: items.length });
  }
  return outcome;
}
