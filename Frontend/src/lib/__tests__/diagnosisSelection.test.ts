import { describe, expect, it, vi } from 'vitest';
import {
  chunkItems,
  classifyDiagnosisEligibility,
  currentDiagnosisResults,
  runDiagnosisBatches,
  selectEligibleDiagnosisItems,
} from '@/lib/diagnosisSelection';
import { mockExecutionResult, mockTestCase, mockValidationResult } from '@/test/fixtures';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type { DiagnoseBatchItem, DiagnosisResult } from '@/types/diagnosis.types';

const test = (id: string): TestCase => ({ ...mockTestCase, id });
const exec = (id: string, overrides: Partial<TestCaseExecutionResult> = {}): TestCaseExecutionResult => ({
  ...mockExecutionResult,
  testCaseId: id,
  executionId: `exec-${id}`,
  request: { ...mockExecutionResult.request, headers: [{ key: 'Authorization', value: 'Bearer secret-token', enabled: true }] as never },
  ...overrides,
});
const failedValidation = (id: string, executionId = `exec-${id}`): TestCaseValidationResult => ({
  ...mockValidationResult,
  testCaseId: id,
  executionId,
  status: 'VALIDATION_FAILED',
  summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
  assertions: [{ id: 'a', category: 'STATUS_CODE', path: 'response.status', expected: '200', actual: '404', passed: false, message: 'Expected 200 got 404' }],
});
const passedValidation = (id: string): TestCaseValidationResult => ({ ...mockValidationResult, testCaseId: id, executionId: `exec-${id}` });
const diagnosis = (id: string, executionId = `exec-${id}`): DiagnosisResult => ({
  diagnosisId: `d-${id}`, testCaseId: id, executionId, diagnosedAt: '2026-10-30T00:00:00Z', durationMs: 1,
  provider: 'mock', providerStatus: 'mock', validationStatus: 'VALIDATION_FAILED', confidence: 'MEDIUM', summary: 's', findings: [],
});

describe('diagnosis eligibility', () => {
  it('diagnoses only execution failures and validation failures with failed assertions', () => {
    expect(classifyDiagnosisEligibility(exec('a', { status: 'ERROR' }), undefined)).toEqual({ eligible: true, reason: 'execution-failure' });
    expect(classifyDiagnosisEligibility(exec('a', { status: 'FAILED_EXECUTION' }), undefined).eligible).toBe(true);
    expect(classifyDiagnosisEligibility(exec('a'), failedValidation('a'))).toEqual({ eligible: true, reason: 'validation-failure' });
    expect(classifyDiagnosisEligibility(exec('a'), passedValidation('a'))).toEqual({ eligible: false, reason: 'passed' });
    expect(classifyDiagnosisEligibility(undefined, undefined)).toEqual({ eligible: false, reason: 'not-executed' });
    expect(classifyDiagnosisEligibility(exec('a', { status: 'SKIPPED' }), undefined)).toEqual({ eligible: false, reason: 'not-executed' });
    expect(classifyDiagnosisEligibility(exec('a'), { ...passedValidation('a'), status: 'NOT_VALIDATABLE', assertions: [] })).toEqual({ eligible: false, reason: 'no-failed-assertions' });
    expect(classifyDiagnosisEligibility(exec('a'), { ...failedValidation('a'), assertions: [] })).toEqual({ eligible: false, reason: 'no-failed-assertions' });
    expect(classifyDiagnosisEligibility(exec('a'), failedValidation('a', 'exec-old'))).toEqual({ eligible: false, reason: 'stale-validation' });
    expect(classifyDiagnosisEligibility(exec('a'), failedValidation('a'), diagnosis('a'))).toEqual({ eligible: false, reason: 'already-diagnosed' });
    // A diagnosis from an older run does not block re-diagnosis of the current run.
    expect(classifyDiagnosisEligibility(exec('a'), failedValidation('a'), diagnosis('a', 'exec-old')).eligible).toBe(true);
  });

  it('selects minimal evidence for eligible items only', () => {
    const tests = [test('pass'), test('fail'), test('err'), test('skip'), test('none')];
    const executions = { pass: exec('pass'), fail: exec('fail'), err: exec('err', { status: 'ERROR', response: undefined }), skip: exec('skip', { status: 'SKIPPED' }) };
    const validations = { pass: passedValidation('pass'), fail: failedValidation('fail') };
    const items = selectEligibleDiagnosisItems(tests, executions, validations, {});
    expect(items.map((item) => item.testCase.id)).toEqual(['fail', 'err']);
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain('secret-token');
    // Execution errors without a validation record are sent as NOT_VALIDATABLE for the same execution.
    expect(items[1].validationResult).toMatchObject({ status: 'NOT_VALIDATABLE', executionId: 'exec-err', assertions: [] });
    expect(selectEligibleDiagnosisItems(tests, executions, validations, {}, { onlyTestIds: ['err'] })).toHaveLength(1);
  });

  it('keeps only diagnoses that match a current test and its current execution', () => {
    const tests = [test('a'), test('b')];
    const executions = { a: exec('a'), b: exec('b') };
    const current = currentDiagnosisResults(tests, executions, {
      a: diagnosis('a'),
      b: diagnosis('b', 'exec-previous-run'),
      other: diagnosis('other'),
    });
    expect(Object.keys(current)).toEqual(['a']);
  });
});

describe('diagnosis batching', () => {
  const items = (count: number): DiagnoseBatchItem[] =>
    Array.from({ length: count }, (_, i) => ({ testCase: test(`t${i}`), executionResult: exec(`t${i}`), validationResult: failedValidation(`t${i}`) }));
  const okBatch = async (batch: DiagnoseBatchItem[]) => ({
    batchId: 'b', diagnosedAt: '', totalDurationMs: 0,
    results: batch.map((item) => diagnosis(item.testCase.id)),
  });

  it('respects the 20-item endpoint limit', () => {
    expect(chunkItems(items(20)).map((c) => c.length)).toEqual([20]);
    expect(chunkItems(items(21)).map((c) => c.length)).toEqual([20, 1]);
    expect(chunkItems(items(41)).map((c) => c.length)).toEqual([20, 20, 1]);
  });

  it('preserves successful batches, reports failed items, and drops mismatched results', async () => {
    const onResults = vi.fn();
    const progress: number[] = [];
    let call = 0;
    const outcome = await runDiagnosisBatches(
      items(45),
      async (batch) => {
        call += 1;
        if (call === 2) throw new Error('Gemini rate limit');
        const response = await okBatch(batch);
        // A result for a different execution must be ignored.
        if (call === 3) response.results[0] = diagnosis(batch[0].testCase.id, 'exec-stale');
        return response;
      },
      { signal: new AbortController().signal, onResults, onProgress: (p) => progress.push(p.done), batchSize: 20 }
    );
    expect(outcome.accepted).toHaveLength(24);
    expect(outcome.failedTestIds).toHaveLength(21);
    expect(outcome.failedTestIds).toContain('t40');
    expect(outcome.errors).toEqual(['Gemini rate limit']);
    expect(onResults).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([0, 20, 40, 45]);
  });

  it('stops on terminal errors and on cancellation without losing completed results', async () => {
    const stop = await runDiagnosisBatches(items(45), async () => { throw new Error('quota'); }, {
      signal: new AbortController().signal,
      shouldStop: () => true,
      batchSize: 20,
    });
    expect(stop.accepted).toHaveLength(0);
    expect(stop.failedTestIds).toHaveLength(45);

    const controller = new AbortController();
    const cancelled = await runDiagnosisBatches(
      items(45),
      async (batch) => {
        controller.abort();
        return okBatch(batch);
      },
      { signal: controller.signal, batchSize: 20 }
    );
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.accepted).toHaveLength(20);
    expect(cancelled.failedTestIds).toHaveLength(25);
  });
});

describe('client diagnosis batch size', () => {
  it('defaults to small batches so each request stays well inside the HTTP timeout', async () => {
    const sizes: number[] = [];
    const items = Array.from({ length: 12 }, (_, i) => ({ testCase: test(`c${i}`), executionResult: exec(`c${i}`), validationResult: failedValidation(`c${i}`) }));
    await runDiagnosisBatches(items, async (batch) => { sizes.push(batch.length); return { batchId: 'b', diagnosedAt: '', totalDurationMs: 0, results: [] }; }, { signal: new AbortController().signal });
    expect(sizes).toEqual([5, 5, 2]);
  });
});
