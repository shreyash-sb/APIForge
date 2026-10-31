import { Download, FileBarChart, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { EndpointReportTable } from '@/components/reports/EndpointReportTable';
import { FailureBreakdownTable } from '@/components/reports/FailureBreakdownTable';
import { ReportCharts } from '@/components/reports/ReportCharts';
import { ReportSummaryCards } from '@/components/reports/ReportSummaryCards';
import { Button } from '@/components/ui/button';
import { reportService, ReportApiError } from '@/services/reportService';
import { useAppStore } from '@/store/useAppStore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { diagnosisService, DiagnosisApiError } from '@/services/diagnosisService';
import { aiSettingsService, describeAiMode, type AiKeyStatus } from '@/services/aiSettingsService';
import {
  classifyDiagnosisEligibility,
  currentDiagnosisResults,
  runDiagnosisBatches,
  selectEligibleDiagnosisItems,
  type DiagnosisEligibility,
  type DiagnosisRunProgress,
} from '@/lib/diagnosisSelection';

/** Stop the run on errors that will not succeed on the next batch either. */
const isTerminalDiagnosisError = (error: unknown) =>
  error instanceof DiagnosisApiError && [401, 403, 413, 429].includes(error.statusCode ?? 0);

export function ReportsPage() {
  const {
    activeSpecification,
    generatedTests,
    executionResults,
    validationResults,
    diagnosisResults,
    reportSummary,
    setReportSummary,
    updateDiagnosisResult,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [diagnosing, setDiagnosing] = useState(false);
  const [progress, setProgress] = useState<DiagnosisRunProgress>();
  const [diagnosisNotice, setDiagnosisNotice] = useState<string>();
  const [diagnosisError, setDiagnosisError] = useState<string>();
  const [failedDiagnosisIds, setFailedDiagnosisIds] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<AiKeyStatus>();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    aiSettingsService
      .getStatus()
      .then((status) => active && setAiStatus(status))
      .catch(() => undefined);
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  // Only diagnoses for current tests and their current executions are shown or reported.
  const currentDiagnoses = useMemo(
    () => currentDiagnosisResults(generatedTests, executionResults, diagnosisResults),
    [generatedTests, executionResults, diagnosisResults]
  );
  const eligibility = useMemo(() => {
    const map: Record<string, DiagnosisEligibility> = {};
    for (const test of generatedTests) {
      map[test.id] = classifyDiagnosisEligibility(executionResults[test.id], validationResults[test.id], currentDiagnoses[test.id]);
    }
    return map;
  }, [generatedTests, executionResults, validationResults, currentDiagnoses]);
  const eligibleCount = Object.values(eligibility).filter((item) => item.eligible).length;

  if (!activeSpecification) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="Import an OpenAPI specification"
        description="Reports aggregate the current test run. Import a specification before generating analytics."
        actionLabel="Import OpenAPI"
        actionPath="/openapi"
      />
    );
  }

  if (!generatedTests.length) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="No generated tests available"
        description="Generate test cases from your active specification to prepare a current-run report."
        actionLabel="Open Test Generator"
        actionPath="/test-generator"
      />
    );
  }

  const generate = async () => {
    setLoading(true);
    setError(undefined);
    try {
      // Read the latest store state so a refresh right after diagnosis includes new results.
      const state = useAppStore.getState();
      const specification = state.activeSpecification ?? activeSpecification;
      const payload = reportService.createPayload(
        specification,
        state.generatedTests,
        Object.values(state.executionResults),
        Object.values(state.validationResults),
        Object.values(currentDiagnosisResults(state.generatedTests, state.executionResults, state.diagnosisResults))
      );
      setReportSummary(await reportService.generateReport(payload));
    } catch (err) {
      setError(err instanceof ReportApiError ? err.message : 'Unable to generate report.');
    } finally {
      setLoading(false);
    }
  };

  const diagnose = async (onlyTestIds?: string[]) => {
    if (diagnosing) return;
    const state = useAppStore.getState();
    const items = selectEligibleDiagnosisItems(
      state.generatedTests,
      state.executionResults,
      state.validationResults,
      currentDiagnosisResults(state.generatedTests, state.executionResults, state.diagnosisResults),
      { onlyTestIds }
    );
    setDiagnosisError(undefined);
    if (!items.length) {
      setDiagnosisNotice('No eligible failures to diagnose. Passing, skipped, unexecuted, and already-diagnosed cases are not sent.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setDiagnosing(true);
    setDiagnosisNotice(undefined);
    try {
      const outcome = await runDiagnosisBatches(items, (batch, signal) => diagnosisService.diagnoseBatch(batch, signal), {
        signal: controller.signal,
        onProgress: setProgress,
        shouldStop: isTerminalDiagnosisError,
        onResults: (results) => {
          const latest = useAppStore.getState().executionResults;
          for (const result of results) {
            // Never attach a diagnosis to a newer run of the same test.
            if (latest[result.testCaseId]?.executionId === result.executionId) updateDiagnosisResult(result.testCaseId, result);
          }
        },
      });
      setFailedDiagnosisIds((previous) => {
        const succeeded = new Set(outcome.accepted.map((result) => result.testCaseId));
        return [...new Set([...previous.filter((id) => !succeeded.has(id)), ...outcome.failedTestIds])];
      });
      const sources = new Set(outcome.accepted.map((result) => result.providerStatus ?? (result.provider === 'mock' ? 'mock' : 'live')));
      const sourceNote = sources.has('fallback')
        ? ' Some results are deterministic fallbacks because Gemini could not answer.'
        : sources.has('mock')
          ? ' Results are mock/demo output (no Gemini key configured).'
          : '';
      const remaining = outcome.failedTestIds.length;
      setDiagnosisNotice(
        `${outcome.cancelled ? 'Diagnosis cancelled. ' : ''}Diagnosed ${outcome.accepted.length} of ${items.length} eligible failure(s).` +
          (remaining ? ` ${remaining} remain undiagnosed — use Diagnose failures to retry.` : '') +
          sourceNote
      );
      if (outcome.errors.length) setDiagnosisError(outcome.errors[outcome.errors.length - 1]);
      if (outcome.accepted.length) await generate();
    } finally {
      abortRef.current = null;
      setDiagnosing(false);
      setProgress(undefined);
    }
  };

  if (!reportSummary) {
    return (
      <div className="space-y-6">
        <section className="panel-surface mx-auto max-w-2xl p-8 lg:p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <FileBarChart className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950 sm:text-3xl">Reports &amp; Analytics</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 max-w-md mx-auto">
            Generate a sanitized, read-only view of this browser session’s test execution, validation, and AI diagnosis results.
          </p>
          <div className="mt-6 flex justify-center">
            <Button className="px-5" onClick={generate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating report…
                </>
              ) : (
                <>
                  <FileBarChart className="h-4 w-4" />
                  Generate current-run report
                </>
              )}
            </Button>
          </div>
          {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <section className="panel-surface flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
            Current Run Analytics
          </div>
          <h1 className="mt-1 text-lg sm:text-xl font-bold tracking-tight text-slate-900">Reports &amp; Analytics</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{reportSummary.metadata.specificationTitle}</span> · Generated{' '}
            {new Date(reportSummary.metadata.generatedAt).toLocaleString()} · Refreshing clears this run.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="font-medium gap-1.5" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="font-medium gap-1.5" onClick={() => reportService.downloadReportJson(reportSummary)}>
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
          <Button variant="outline" size="sm" className="font-medium gap-1.5" onClick={() => reportService.downloadEndpointCsv(reportSummary.endpoints)}>
            <Download className="h-3.5 w-3.5" />
            Endpoints CSV
          </Button>
          <Button variant="outline" size="sm" className="font-medium gap-1.5" onClick={() => reportService.downloadFailureCsv(reportSummary.failures)}>
            <Download className="h-3.5 w-3.5" />
            Failures CSV
          </Button>
        </div>
      </section>

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      {/* Summary Cards */}
      <ReportSummaryCards report={reportSummary} />

      {/* Visual Analytics Charts */}
      <ReportCharts report={reportSummary} />

      {/* Endpoint Health Section */}
      <section className="panel-surface p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Endpoint Health</h2>
          <p className="mt-1 text-sm text-slate-500">
            Deterministic execution and contract-validation outcomes by endpoint.
          </p>
        </div>
        <div className="mt-5">
          <EndpointReportTable endpoints={reportSummary.endpoints} />
        </div>
      </section>

      {/* Failure & Anomaly Analysis */}
      <section className="panel-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Failure &amp; Anomaly Analysis</h2>
            <p className="mt-1 text-sm text-slate-500">
              Execution issues remain distinct from contract failures. AI findings explain, never change, these results.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link className="text-sky-700 hover:underline" to="/response-validation">
              Validation detail →
            </Link>
            <Link className="text-violet-700 hover:underline" to="/ai-assistant">
              AI detail →
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-600">
            <p>
              AI diagnosis is advisory and only covers failed executions and failed assertions; it never changes pass/fail counts.
            </p>
            <p className="mt-0.5">
              Provider: <span className="font-semibold text-slate-800">{describeAiMode(aiStatus)}</span>
              {aiStatus && !aiStatus.configured && (
                <>
                  {' '}
                  ·{' '}
                  <Link className="font-semibold text-violet-700 hover:underline" to="/settings">
                    Add your Gemini key
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {diagnosing ? (
              <>
                <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Diagnosing {progress?.done ?? 0}/{progress?.total ?? 0}…
                </span>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => abortRef.current?.abort()}>
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={() => void diagnose()} disabled={eligibleCount === 0 || loading}>
                <Sparkles className="h-3.5 w-3.5" />
                Diagnose failures ({eligibleCount} eligible)
              </Button>
            )}
          </div>
        </div>
        {diagnosisNotice && <p className="mt-2 text-xs font-medium text-slate-700">{diagnosisNotice}</p>}
        {diagnosisError && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
            {diagnosisError}
          </p>
        )}
        <div className="mt-5">
          <FailureBreakdownTable
            failures={reportSummary.failures}
            diagnoses={currentDiagnoses}
            eligibility={eligibility}
            onDiagnose={(ids) => void diagnose(ids)}
            diagnosing={diagnosing}
            failedDiagnosisIds={failedDiagnosisIds}
          />
        </div>
      </section>
    </div>
  );
}
