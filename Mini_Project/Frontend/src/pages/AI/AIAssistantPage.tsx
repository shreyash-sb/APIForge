import { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Info,
  Lightbulb,
  Loader2,
  Search,
  Sparkles,
  TestTube2,
  XCircle,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { diagnosisService, DiagnosisApiError } from '@/services/diagnosisService';
import { useAppStore } from '@/store/useAppStore';
import type {
  DiagnosisConfidence,
  DiagnosisFinding,
  DiagnosisResult,
  DiagnosisSeverity,
} from '@/types/diagnosis.types';

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const severityConfig: Record<
  DiagnosisSeverity,
  { label: string; className: string; icon: typeof AlertCircle }
> = {
  INFO: {
    label: 'Info',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Info,
  },
  WARNING: {
    label: 'Warning',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertTriangle,
  },
  ERROR: {
    label: 'Error',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
  },
  CRITICAL: {
    label: 'Critical',
    className: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: AlertCircle,
  },
};

const confidenceConfig: Record<
  DiagnosisConfidence,
  { label: string; className: string; icon: typeof Sparkles }
> = {
  HIGH: {
    label: 'High Confidence',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  MEDIUM: {
    label: 'Medium Confidence',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertTriangle,
  },
  LOW: {
    label: 'Low Confidence',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
    icon: AlertCircle,
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FindingCard({ finding }: { finding: DiagnosisFinding }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = severityConfig[finding.severity];
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-200 hover:shadow-md ${
        finding.severity === 'CRITICAL'
          ? 'border-purple-200 bg-purple-50/50'
          : finding.severity === 'ERROR'
          ? 'border-rose-200 bg-rose-50/50'
          : finding.severity === 'WARNING'
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-blue-200 bg-blue-50/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            finding.severity === 'CRITICAL'
              ? 'bg-purple-100'
              : finding.severity === 'ERROR'
              ? 'bg-rose-100'
              : finding.severity === 'WARNING'
              ? 'bg-amber-100'
              : 'bg-blue-100'
          }`}
        >
          <Icon
            className={`h-4 w-4 ${
              finding.severity === 'CRITICAL'
                ? 'text-purple-600'
                : finding.severity === 'ERROR'
                ? 'text-rose-600'
                : finding.severity === 'WARNING'
                ? 'text-amber-600'
                : 'text-blue-600'
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{finding.title}</span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}
            >
              {cfg.label}
            </span>
          </div>

          {expanded && (
            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <p className="text-sm leading-relaxed text-slate-700">{finding.explanation}</p>
              <div className="flex items-start gap-2 rounded-lg bg-white/70 p-3 shadow-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-amber-700">Suggestion: </span>
                  {finding.suggestion}
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="ml-2 shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-600"
          aria-label={expanded ? 'Collapse finding' : 'Expand finding'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function DiagnosisCard({
  testCase,
  result,
  isRunning,
  onDiagnose,
}: {
  testCase: { id: string; name: string; type: string; endpoint: { method: string; path: string } };
  result?: DiagnosisResult;
  isRunning: boolean;
  onDiagnose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const methodColors: Record<string, string> = {
    GET: 'bg-sky-100 text-sky-800 border-sky-200',
    POST: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    PUT: 'bg-amber-100 text-amber-800 border-amber-200',
    PATCH: 'bg-violet-100 text-violet-800 border-violet-200',
    DELETE: 'bg-rose-100 text-rose-800 border-rose-200',
    HEAD: 'bg-slate-100 text-slate-800 border-slate-200',
    OPTIONS: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  };

  return (
    <div
      className={`rounded-2xl border bg-white transition-all duration-200 hover:shadow-md ${
        result?.findings.some((f) => f.severity === 'ERROR' || f.severity === 'CRITICAL')
          ? 'border-rose-200'
          : result?.findings.some((f) => f.severity === 'WARNING')
          ? 'border-amber-200'
          : result
          ? 'border-emerald-200'
          : 'border-slate-200'
      }`}
    >
      {/* Card header */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold ${
              methodColors[testCase.endpoint.method] ?? 'bg-slate-100 text-slate-800'
            }`}
          >
            {testCase.endpoint.method}
          </span>
          <span className="min-w-0 truncate font-mono text-sm text-slate-700">
            {testCase.endpoint.path}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {result && (
            <>
              {/* Confidence badge */}
              {(() => {
                const cfg = confidenceConfig[result.confidence];
                const Icon = cfg.icon;
                return (
                  <span
                    className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium sm:inline-flex ${cfg.className}`}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                );
              })()}

              {/* Finding count */}
              {result.findings.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                  {result.findings.length} finding{result.findings.length !== 1 ? 's' : ''}
                </span>
              )}

              {result.findings.length === 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Clean
                </span>
              )}
            </>
          )}

          <Button
            size="sm"
            variant={result ? 'outline' : 'default'}
            onClick={onDiagnose}
            disabled={isRunning}
            className="h-7 gap-1 text-xs"
            id={`diagnose-btn-${testCase.id}`}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Analysing…
              </>
            ) : result ? (
              <>
                <Brain className="h-3 w-3" />
                Re-run
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Diagnose
              </>
            )}
          </Button>

          {result && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Test name */}
      <div className="border-t border-slate-100 px-4 py-2">
        <p className="truncate text-xs text-slate-500">{testCase.name}</p>
      </div>

      {/* Expanded result */}
      {result && expanded && (
        <div className="border-t border-slate-100 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Summary */}
          <div className="mb-4 rounded-xl bg-slate-50 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Bot className="h-4 w-4 text-violet-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                AI Summary
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{result.summary}</p>
            <p className="mt-2 text-xs text-slate-400">
              Diagnosed in {result.durationMs}ms · provider: {result.provider} ·{' '}
              {new Date(result.diagnosedAt).toLocaleTimeString()}
            </p>
          </div>

          {/* Findings */}
          {result.findings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Findings ({result.findings.length})
              </h4>
              {result.findings.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          )}

          {result.findings.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="text-sm text-emerald-700">
                No issues found. The response contract is fully satisfied.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function AIAssistantPage() {
  const {
    generatedTests,
    executionResults,
    validationResults,
    diagnosisResults,
    updateDiagnosisResult,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<DiagnosisSeverity | 'ALL'>('ALL');
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Tests that have both execution + validation results (ready for diagnosis)
  const eligibleTests = useMemo(() => {
    return generatedTests.filter(
      (tc) => executionResults[tc.id] && validationResults[tc.id]
    );
  }, [generatedTests, executionResults, validationResults]);

  const filteredTests = useMemo(() => {
    let list = eligibleTests;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tc) =>
          tc.name.toLowerCase().includes(q) ||
          tc.endpoint.path.toLowerCase().includes(q) ||
          tc.endpoint.method.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'ALL') {
      list = list.filter((tc) => {
        const result = diagnosisResults[tc.id];
        return result?.findings.some((f) => f.severity === severityFilter);
      });
    }
    return list;
  }, [eligibleTests, search, severityFilter, diagnosisResults]);

  const stats = useMemo(() => {
    const diagnosed = Object.values(diagnosisResults);
    const withFindings = diagnosed.filter((r) => r.findings.length > 0);
    const totalFindings = diagnosed.reduce((acc, r) => acc + r.findings.length, 0);
    const errors = diagnosed.reduce(
      (acc, r) =>
        acc + r.findings.filter((f) => f.severity === 'ERROR' || f.severity === 'CRITICAL').length,
      0
    );
    return { diagnosed: diagnosed.length, withFindings: withFindings.length, totalFindings, errors };
  }, [diagnosisResults]);

  const handleDiagnoseOne = async (testCaseId: string) => {
    const tc = generatedTests.find((t) => t.id === testCaseId);
    const execResult = executionResults[testCaseId];
    const valResult = validationResults[testCaseId];
    if (!tc || !execResult || !valResult) return;

    setRunningIds((prev) => new Set(prev).add(testCaseId));
    setGlobalError(null);

    try {
      const result = await diagnosisService.diagnoseSingle(tc, execResult, valResult);
      updateDiagnosisResult(testCaseId, result);
    } catch (err) {
      const msg = err instanceof DiagnosisApiError ? err.message : 'AI diagnosis failed.';
      setGlobalError(msg);
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(testCaseId);
        return next;
      });
    }
  };

  const handleDiagnoseAll = async () => {
    if (eligibleTests.length === 0) return;
    setBatchRunning(true);
    setGlobalError(null);

    const items = eligibleTests.map((tc) => ({
      testCase: tc,
      executionResult: executionResults[tc.id]!,
      validationResult: validationResults[tc.id]!,
    }));

    try {
      const batchResult = await diagnosisService.diagnoseBatch(items);
      for (const result of batchResult.results) {
        updateDiagnosisResult(result.testCaseId, result);
      }
    } catch (err) {
      const msg = err instanceof DiagnosisApiError ? err.message : 'Batch AI diagnosis failed.';
      setGlobalError(msg);
    } finally {
      setBatchRunning(false);
    }
  };

  // Empty state: no tests generated yet
  if (generatedTests.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-100">
            <Brain className="h-10 w-10 text-violet-500" />
          </div>
          <div className="max-w-md text-center">
            <h2 className="mb-2 text-xl font-bold text-slate-900">AI Diagnosis — Phase 7</h2>
            <p className="text-slate-500">
              AI Diagnosis analyses your execution and validation results to explain failures and
              suggest improvements. Generate and execute tests first.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/test-generator">
              <Button variant="default" id="goto-test-generator">
                <TestTube2 className="mr-2 h-4 w-4" />
                Go to Test Generator
              </Button>
            </Link>
            <Link to="/response-validation">
              <Button variant="outline" id="goto-validation">
                <Zap className="mr-2 h-4 w-4" />
                Run Validation
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Tests exist but none have been executed + validated
  if (eligibleTests.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100">
            <AlertCircle className="h-10 w-10 text-amber-500" />
          </div>
          <div className="max-w-md text-center">
            <h2 className="mb-2 text-xl font-bold text-slate-900">No Validated Tests</h2>
            <p className="text-slate-500">
              {generatedTests.length} test{generatedTests.length !== 1 ? 's' : ''} have been
              generated but none have execution and validation results yet. Run the tests and
              validate responses first.
            </p>
          </div>
          <Link to="/response-validation">
            <Button variant="default" id="goto-validation-2">
              <Zap className="mr-2 h-4 w-4" />
              Run Validation
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-purple-50/20">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">AI Diagnosis</h1>
                <p className="text-xs text-slate-500">
                  {eligibleTests.length} test{eligibleTests.length !== 1 ? 's' : ''} ready ·{' '}
                  {stats.diagnosed} diagnosed
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => void handleDiagnoseAll()}
                disabled={batchRunning || eligibleTests.length === 0}
                id="diagnose-all-btn"
                className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
              >
                {batchRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analysing all…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Diagnose All
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Global error */}
        {globalError && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="min-w-0">
              <p className="font-medium text-rose-700">AI diagnosis error</p>
              <p className="text-sm text-rose-600">{globalError}</p>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="ml-auto shrink-0 text-rose-400 hover:text-rose-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats strip */}
        {stats.diagnosed > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: 'Diagnosed',
                value: stats.diagnosed,
                icon: Brain,
                color: 'text-violet-600 bg-violet-50 border-violet-200',
              },
              {
                label: 'With Findings',
                value: stats.withFindings,
                icon: AlertTriangle,
                color: 'text-amber-600 bg-amber-50 border-amber-200',
              },
              {
                label: 'Total Findings',
                value: stats.totalFindings,
                icon: Filter,
                color: 'text-blue-600 bg-blue-50 border-blue-200',
              },
              {
                label: 'Errors/Critical',
                value: stats.errors,
                icon: XCircle,
                color: stats.errors > 0
                  ? 'text-rose-600 bg-rose-50 border-rose-200'
                  : 'text-slate-400 bg-slate-50 border-slate-200',
              },
            ].map((s) => (
              <div
                key={s.label}
                className={`flex items-center gap-3 rounded-xl border p-4 ${s.color}`}
              >
                <s.icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs font-medium opacity-80">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Advisory note */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
          <p className="text-sm text-violet-700">
            <span className="font-semibold">Advisory layer only.</span> AI findings are suggestions
            to help you investigate issues. Phase 6 deterministic validation remains the source of
            truth for pass/fail status.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="diagnosis-search"
              placeholder="Search tests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'ERROR', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  severityFilter === sev
                    ? 'border-violet-300 bg-violet-100 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {sev === 'ALL' ? 'All' : sev}
              </button>
            ))}
          </div>
        </div>

        {/* Test list */}
        {filteredTests.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <Search className="h-8 w-8 text-slate-300" />
            <p className="text-slate-500">No tests match your filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTests.map((tc) => (
              <DiagnosisCard
                key={tc.id}
                testCase={tc}
                result={diagnosisResults[tc.id]}
                isRunning={runningIds.has(tc.id)}
                onDiagnose={() => void handleDiagnoseOne(tc.id)}
              />
            ))}
          </div>
        )}

        {/* Tip when no diagnoses run yet */}
        {stats.diagnosed === 0 && (
          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
              <Clock className="h-7 w-7 text-violet-400" />
            </div>
            <p className="max-w-sm text-sm text-slate-500">
              Click <strong>Diagnose All</strong> to run AI analysis on all{' '}
              {eligibleTests.length} validated tests at once, or click{' '}
              <strong>Diagnose</strong> on any individual test.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
