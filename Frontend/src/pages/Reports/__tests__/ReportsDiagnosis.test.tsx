import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from '../ReportsPage';
import { reportService } from '@/services/reportService';
import { diagnosisService } from '@/services/diagnosisService';
import { aiSettingsService } from '@/services/aiSettingsService';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { mockExecutionResult, mockReportSummary, mockSpecification, mockTestCase, mockValidationResult } from '@/test/fixtures';
import { useAppStore } from '@/store/useAppStore';
import type { DiagnoseBatchItem, DiagnosisResult } from '@/types/diagnosis.types';
import type { GenerateReportRequest, ReportSummary } from '@/types/report.types';

const t = (id: string) => ({ ...mockTestCase, id, name: `test ${id}` });
const diagnosisFor = (item: DiagnoseBatchItem, overrides: Partial<DiagnosisResult> = {}): DiagnosisResult => ({
  diagnosisId: `diag-${item.testCase.id}`,
  testCaseId: item.testCase.id,
  executionId: item.executionResult.executionId,
  diagnosedAt: '2026-10-30T10:00:00Z',
  durationMs: 3,
  provider: 'mock',
  providerStatus: 'mock',
  validationStatus: item.validationResult.status,
  confidence: 'MEDIUM',
  summary: `Summary for ${item.testCase.id}`,
  findings: [{ id: 'f0', title: `Finding ${item.testCase.id}`, explanation: 'Status mismatch', severity: 'ERROR', suggestion: `Fix ${item.testCase.id}` }],
  ...overrides,
});

/** Simulates the backend aggregation closely enough to verify refresh behaviour. */
function fakeReport(payload: GenerateReportRequest): ReportSummary {
  const failures = ['t1', 't3'].map((id) => {
    const d = payload.diagnosisResults?.find((item) => item.testCaseId === id);
    return {
      testCaseId: id, testName: `test ${id}`, method: 'GET', path: '/users/{id}', testType: 'POSITIVE' as const, priority: 'HIGH' as const,
      executionStatus: id === 't3' ? ('ERROR' as const) : ('PASSED_EXECUTION' as const),
      validationStatus: id === 't3' ? ('UNVALIDATED' as const) : ('VALIDATION_FAILED' as const),
      failedAssertionCount: id === 't1' ? 1 : 0, failedAssertionCategories: id === 't1' ? (['STATUS_CODE'] as const).slice() : [], failedAssertionPaths: [],
      message: id === 't1' ? 'Expected 200 but received 404' : 'connect ECONNREFUSED', expected: id === 't1' ? '200' : undefined, actual: id === 't1' ? '404' : undefined,
      diagnosisId: d?.diagnosisId, aiDiagnosisSummary: d?.summary, aiConfidence: d?.confidence, aiProvider: d?.provider, aiProviderStatus: d?.providerStatus,
      aiSeverity: d ? ('ERROR' as const) : undefined,
    };
  });
  return { ...mockReportSummary, diagnosis: { ...mockReportSummary.diagnosis, diagnosedTests: payload.diagnosisResults?.length ?? 0 }, failures };
}

function seed() {
  const store = useAppStore.getState();
  store.setActiveSpecification(mockSpecification);
  store.setGeneratedTests([t('t1'), t('t2'), t('t3')]);
  store.setExecutionResults({
    t1: { ...mockExecutionResult, testCaseId: 't1', executionId: 'e1', response: { ...mockExecutionResult.response!, status: 404 } },
    t2: { ...mockExecutionResult, testCaseId: 't2', executionId: 'e2' },
    t3: { ...mockExecutionResult, testCaseId: 't3', executionId: 'e3', status: 'ERROR', response: undefined, error: { type: 'NETWORK_ERROR', message: 'connect ECONNREFUSED' } as never },
  });
  store.setValidationResults({
    t1: {
      ...mockValidationResult, testCaseId: 't1', executionId: 'e1', status: 'VALIDATION_FAILED',
      summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
      assertions: [{ id: 'a', category: 'STATUS_CODE', path: 'response.status', expected: '200', actual: '404', passed: false, message: 'Expected 200 but received 404' }],
    },
    t2: { ...mockValidationResult, testCaseId: 't2', executionId: 'e2' },
  });
  // A diagnosis from a previous run of t3 must never be shown or reported.
  store.setDiagnosisResults({
    t3: { ...diagnosisFor({ testCase: t('t3'), executionResult: { ...mockExecutionResult, executionId: 'e3-old' }, validationResult: mockValidationResult } as DiagnoseBatchItem), summary: 'STALE' },
  });
}

describe('Reports “Diagnose failures”', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue({ provider: 'google-gemini', configured: false, storage: 'session', model: 'm', mode: 'mock-demo' });
    seed();
  });

  it('diagnoses only eligible failures, stores matching results, and refreshes the report without changing metrics', async () => {
    const generate = vi.spyOn(reportService, 'generateReport').mockImplementation(async (payload) => fakeReport(payload));
    const batch = vi.spyOn(diagnosisService, 'diagnoseBatch').mockImplementation(async (items) => ({
      batchId: 'b', diagnosedAt: '', totalDurationMs: 1, results: items.map((item) => diagnosisFor(item)),
    }));
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    await user.click(screen.getByRole('button', { name: /generate current-run report/i }));
    expect(generate.mock.calls[0][0].diagnosisResults).toEqual([]); // stale t3 diagnosis filtered out
    expect(await screen.findByText(/Mock\/demo mode — no Gemini key configured/)).toBeInTheDocument();
    expect(screen.getAllByText('Not diagnosed')).toHaveLength(2);

    const before = JSON.stringify([useAppStore.getState().executionResults, useAppStore.getState().validationResults]);
    await user.click(screen.getByRole('button', { name: /Diagnose failures \(2 eligible\)/i }));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0].map((item) => item.testCase.id)).toEqual(['t1', 't3']);
    const stored = useAppStore.getState().diagnosisResults;
    expect(stored.t1.executionId).toBe('e1');
    expect(stored.t3.executionId).toBe('e3');
    expect(generate.mock.calls[1][0].diagnosisResults?.map((d) => d.testCaseId).sort()).toEqual(['t1', 't3']);
    expect(JSON.stringify([useAppStore.getState().executionResults, useAppStore.getState().validationResults])).toBe(before);

    expect(await screen.findByText(/Diagnosed 2 of 2 eligible failure/)).toBeInTheDocument();
    expect(screen.getByText(/Results are mock\/demo output/)).toBeInTheDocument();
    expect(screen.getAllByText(/Mock\/demo · MEDIUM confidence/)).toHaveLength(2);
    expect(screen.queryByText('STALE')).not.toBeInTheDocument();
    // Deterministic values stay visible.
    expect(screen.getByText('Expected 200 · Actual 404')).toBeInTheDocument();

    const [firstDetails] = screen.getAllByRole('button', { name: /View details/i });
    await user.click(firstDetails);
    expect(screen.getByText('Suggested fix: Fix t1')).toBeInTheDocument();
    expect(screen.getByText(/AI findings are advisory/)).toBeInTheDocument();
  });

  it('preserves partial results, marks remaining cases, and retries only what failed', async () => {
    vi.spyOn(reportService, 'generateReport').mockImplementation(async (payload) => fakeReport(payload));
    const batch = vi
      .spyOn(diagnosisService, 'diagnoseBatch')
      .mockImplementationOnce(async (items) => ({
        batchId: 'b1', diagnosedAt: '', totalDurationMs: 1,
        results: [diagnosisFor(items[0], { provider: 'mock', providerStatus: 'fallback', fallbackReason: 'Gemini rate limit or quota exhausted (HTTP 429)' })],
        failures: [{ testCaseId: 't3', executionId: 'e3', message: 'This case could not be diagnosed. Retry later.' }],
      }))
      .mockImplementationOnce(async (items) => ({ batchId: 'b2', diagnosedAt: '', totalDurationMs: 1, results: items.map((item) => diagnosisFor(item)) }));
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    await user.click(screen.getByRole('button', { name: /generate current-run report/i }));
    await user.click(await screen.findByRole('button', { name: /Diagnose failures \(2 eligible\)/i }));

    expect(await screen.findByText(/Diagnosed 1 of 2 eligible failure\(s\)\. 1 remain undiagnosed/)).toBeInTheDocument();
    expect(screen.getByText(/deterministic fallbacks because Gemini could not answer/)).toBeInTheDocument();
    expect(screen.getByText(/Fallback \(Gemini unavailable\)/)).toBeInTheDocument();
    expect(screen.getByText('Diagnosis failed')).toBeInTheDocument();

    const t1Result = useAppStore.getState().diagnosisResults.t1;
    await user.click(screen.getByRole('button', { name: /Retry diagnosis/i }));
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(2));
    expect(batch.mock.calls[1][0].map((item) => item.testCase.id)).toEqual(['t3']);
    expect(useAppStore.getState().diagnosisResults.t1).toEqual(t1Result); // valid result not overwritten
    await waitFor(() => expect(screen.queryByText('Diagnosis failed')).not.toBeInTheDocument());
  });

  it('shows a safe error and keeps rows undiagnosed when the provider request fails', async () => {
    vi.spyOn(reportService, 'generateReport').mockImplementation(async (payload) => fakeReport(payload));
    vi.spyOn(diagnosisService, 'diagnoseBatch').mockRejectedValue(new Error('Too many AI requests. Please wait a minute before retrying.'));
    const user = userEvent.setup();
    renderWithRouter(<ReportsPage />);
    await user.click(screen.getByRole('button', { name: /generate current-run report/i }));
    await user.click(await screen.findByRole('button', { name: /Diagnose failures/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many AI requests');
    expect(screen.getByText(/Diagnosed 0 of 2/)).toBeInTheDocument();
    expect(screen.getAllByText('Diagnosis failed')).toHaveLength(2);
    expect(useAppStore.getState().diagnosisResults.t1).toBeUndefined();
  });
});
