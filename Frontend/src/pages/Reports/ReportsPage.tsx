import { Download, FileBarChart, Loader2, RefreshCw, ShoppingBag, Users, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { EndpointReportTable } from '@/components/reports/EndpointReportTable';
import { FailureBreakdownTable } from '@/components/reports/FailureBreakdownTable';
import { ReportCharts } from '@/components/reports/ReportCharts';
import { ReportSummaryCards } from '@/components/reports/ReportSummaryCards';
import { Button } from '@/components/ui/button';
import { reportService, ReportApiError } from '@/services/reportService';
import { useAppStore } from '@/store/useAppStore';
import { loadDemoProject } from '@/services/demoProjectService';
import { useState } from 'react';

export function ReportsPage() {
  const {
    activeSpecification,
    generatedTests,
    executionResults,
    validationResults,
    diagnosisResults,
    reportSummary,
    setReportSummary,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  if (!activeSpecification) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={FileBarChart}
          title="Import an OpenAPI specification"
          description="Reports aggregate the current test run. Import a specification before generating analytics."
          actionLabel="Import OpenAPI"
          actionPath="/openapi"
        />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => void loadDemoProject('user')} className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5 text-xs h-9">
            <Users className="h-4 w-4" />
            + Load User Demo Suite
          </Button>
          <Button onClick={() => void loadDemoProject('ecommerce')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-9">
            <ShoppingBag className="h-4 w-4" />
            + Load QuickCart Demo Suite
          </Button>
        </div>
      </div>
    );
  }

  if (!generatedTests.length) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={FileBarChart}
          title="No generated tests available"
          description="Generate test cases from your active specification to prepare a current-run report."
          actionLabel="Open Test Generator"
          actionPath="/test-generator"
        />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => void loadDemoProject('user')} className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5 text-xs h-9">
            <Users className="h-4 w-4" />
            + Synthesize User Tests
          </Button>
          <Button onClick={() => void loadDemoProject('ecommerce')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-9">
            <ShoppingBag className="h-4 w-4" />
            + Synthesize QuickCart Tests
          </Button>
        </div>
      </div>
    );
  }

  const generate = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const payload = reportService.createPayload(
        activeSpecification,
        generatedTests,
        Object.values(executionResults),
        Object.values(validationResults),
        Object.values(diagnosisResults)
      );
      setReportSummary(await reportService.generateReport(payload));
    } catch (err) {
      setError(err instanceof ReportApiError ? err.message : 'Unable to generate report.');
    } finally {
      setLoading(false);
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
            <Button className="h-10 px-5" onClick={generate} disabled={loading}>
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
          <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
            Current Run Analytics
          </div>
          <h1 className="mt-1 text-lg sm:text-xl font-bold tracking-tight text-slate-900">Reports &amp; Analytics</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{reportSummary.metadata.specificationTitle}</span> · Generated{' '}
            {new Date(reportSummary.metadata.generatedAt).toLocaleString()} · Refreshing clears this run.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium gap-1.5" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium gap-1.5" onClick={() => reportService.downloadReportJson(reportSummary)}>
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
          <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium gap-1.5" onClick={() => reportService.downloadEndpointCsv(reportSummary.endpoints)}>
            <Download className="h-3.5 w-3.5" />
            Endpoints CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium gap-1.5" onClick={() => reportService.downloadFailureCsv(reportSummary.failures)}>
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
        <div className="mt-5">
          <FailureBreakdownTable failures={reportSummary.failures} />
        </div>
      </section>
    </div>
  );
}
