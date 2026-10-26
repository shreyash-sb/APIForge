import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { testGeneratorService } from '@/services/testGeneratorService';
import { testExecutionService } from '@/services/testExecutionService';
import { useAppStore } from '@/store/useAppStore';
import type { TestCase, TestCaseType, TestGenerationSettings } from '@/types/testCase.types';
import type {
  TestCaseExecutionResult,
  TestExecutionStatus,
  TestExecutionSummary,
} from '@/types/testExecution.types';

const CATEGORIES: TestCaseType[] = ['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'SECURITY', 'SCHEMA', 'PARAMETER'];
const typeStyle: Record<TestCaseType, string> = {
  POSITIVE: 'bg-emerald-100 text-emerald-700',
  NEGATIVE: 'bg-rose-100 text-rose-700',
  BOUNDARY: 'bg-amber-100 text-amber-700',
  SECURITY: 'bg-violet-100 text-violet-700',
  SCHEMA: 'bg-sky-100 text-sky-700',
  PARAMETER: 'bg-slate-100 text-slate-700',
};

const executionStatusBadge: Record<
  TestExecutionStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  PENDING: { label: 'Pending', className: 'bg-slate-100 text-slate-600', icon: Clock },
  RUNNING: { label: 'Running', className: 'bg-blue-100 text-blue-700 animate-pulse', icon: Loader2 },
  PASSED_EXECUTION: {
    label: 'Executed (Response Received)',
    className: 'bg-emerald-100 text-emerald-800',
    icon: CheckCircle2,
  },
  FAILED_EXECUTION: {
    label: 'Execution Failed',
    className: 'bg-amber-100 text-amber-800',
    icon: AlertCircle,
  },
  ERROR: { label: 'Execution Error', className: 'bg-rose-100 text-rose-800', icon: XCircle },
  SKIPPED: { label: 'Skipped', className: 'bg-slate-100 text-slate-500', icon: Clock },
};

export function TestGeneratorPage() {
  const specification = useAppStore((state) => state.activeSpecification);
  const storeGeneratedTests = useAppStore((state) => state.generatedTests);
  const setStoreGeneratedTests = useAppStore((state) => state.setGeneratedTests);
  const storeExecutionResults = useAppStore((state) => state.executionResults);
  const setStoreExecutionResults = useAppStore((state) => state.setExecutionResults);
  const updateStoreExecutionResult = useAppStore((state) => state.updateExecutionResult);

  const [categories, setCategories] = useState<TestCaseType[]>(CATEGORIES);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState<string[]>([]);
  const [maxTestsPerEndpoint, setMaxTestsPerEndpoint] = useState(15);
  const [tests, setTests] = useState<TestCase[]>(() => storeGeneratedTests);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => storeGeneratedTests[0]?.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Phase 5: Test Execution State
  const [executionResults, setExecutionResults] = useState<Record<string, TestCaseExecutionResult>>(() => storeExecutionResults);
  const [executionSummary, setExecutionSummary] = useState<TestExecutionSummary | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executingSingleId, setExecutingSingleId] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  useEffect(() => {
    setTests(storeGeneratedTests);
    if (!selectedId && storeGeneratedTests.length > 0) {
      setSelectedId(storeGeneratedTests[0]?.id);
    } else if (storeGeneratedTests.length === 0) {
      setSelectedId(undefined);
    }
  }, [storeGeneratedTests, selectedId]);

  useEffect(() => {
    setExecutionResults(storeExecutionResults);
  }, [storeExecutionResults]);

  const selected = tests.find((test) => test.id === selectedId);
  const endpointIds = useMemo(() => specification?.endpoints.map((endpoint) => endpoint.id) ?? [], [specification]);

  if (!specification) {
    return (
      <div className="panel-surface mx-auto max-w-2xl p-8 text-center">
        <FlaskConical className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-950">Import an API before generating tests</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The deterministic generator consumes APIForge’s normalized OpenAPI model. Import a specification first; no
          target API requests are sent during generation.
        </p>
        <Link to="/openapi">
          <Button className="mt-5">Import OpenAPI</Button>
        </Link>
      </div>
    );
  }

  const generate = async () => {
    if (!categories.length) {
      setError('Select at least one test category.');
      return;
    }
    setLoading(true);
    setError(undefined);
    setExecutionResults({});
    setStoreExecutionResults({});
    setExecutionSummary(null);
    setExecutionError(null);

    const settings: TestGenerationSettings = {
      endpointIds: selectedEndpointIds.length ? selectedEndpointIds : undefined,
      categories,
      maxTestsPerEndpoint,
    };

    try {
      const suite = await testGeneratorService.generate({ specification, settings });
      setTests(suite.tests);
      setStoreGeneratedTests(suite.tests);
      setSelectedId(suite.tests[0]?.id);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Test generation failed. Ensure the APIForge backend is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  const executeAllTests = async () => {
    if (!tests.length) return;
    setExecuting(true);
    setExecutionError(null);

    try {
      const suiteResult = await testExecutionService.executeBatch(tests);
      const resultMap: Record<string, TestCaseExecutionResult> = {};
      for (const res of suiteResult.results) {
        resultMap[res.testCaseId] = res;
      }
      setExecutionResults(resultMap);
      setStoreExecutionResults(resultMap);
      setExecutionSummary(suiteResult.summary);
    } catch (err) {
      setExecutionError(
        err instanceof Error ? err.message : 'Batch execution failed. Check backend connection.'
      );
    } finally {
      setExecuting(false);
    }
  };

  const executeSingleTest = async (testCase: TestCase) => {
    setExecutingSingleId(testCase.id);
    setExecutionError(null);

    try {
      const result = await testExecutionService.executeSingle(testCase);
      setExecutionResults((prev) => ({
        ...prev,
        [testCase.id]: result,
      }));
      updateStoreExecutionResult(testCase.id, result);
    } catch (err) {
      setExecutionError(
        err instanceof Error ? err.message : `Execution failed for test ${testCase.name}`
      );
    } finally {
      setExecutingSingleId(null);
    }
  };

  const update = (id: string, change: Partial<TestCase>) => {
    setTests((current) => {
      const updated = current.map((test) => (test.id === id ? { ...test, ...change } : test));
      setStoreGeneratedTests(updated);
      return updated;
    });
  };

  const remove = (id: string) => {
    setTests((current) => {
      const updated = current.filter((test) => test.id !== id);
      setStoreGeneratedTests(updated);
      return updated;
    });
    if (selectedId === id) setSelectedId(undefined);
  };

  const toggleCategory = (category: TestCaseType) =>
    setCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );

  const toggleEndpoint = (id: string) =>
    setSelectedEndpointIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );

  const executedCount = Object.keys(executionResults).length;

  return (
    <div className="space-y-5">
      {/* Top Banner & Generation Settings */}
      <section className="panel-surface p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
              <CheckSquare className="h-3.5 w-3.5" />
              Deterministic test generation & execution
            </div>
            <h2 className="mt-1 text-lg sm:text-xl font-bold tracking-tight text-slate-950">
              {specification.metadata.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Generate executable tests from the normalized OpenAPI model and run automated executions through the HTTP executor
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={generate} disabled={loading || executing} size="sm" className="h-8.5 text-xs font-medium gap-1.5">
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {tests.length ? 'Regenerate Tests' : 'Generate Tests'}
                </>
              )}
            </Button>
            {tests.length > 0 && (
              <Button
                variant="default"
                size="sm"
                className="h-8.5 text-xs font-medium gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={executeAllTests}
                disabled={executing || loading}
              >
                {executing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Executing Batch...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Run All Tests ({tests.length})
                  </>
                )}
              </Button>
            )}
            {executedCount > 0 && (
              <Link to="/response-validation">
                <Button variant="outline" size="sm" className="h-8.5 text-xs font-medium gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50">
                  <Activity className="h-3.5 w-3.5" />
                  Validate ({executedCount})
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3 pt-3 border-t border-slate-100">
          <ControlGroup title="Test categories">
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={categories.includes(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  {category}
                </label>
              ))}
            </div>
          </ControlGroup>

          <ControlGroup title="Endpoints">
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {specification.endpoints.map((endpoint) => (
                <label
                  key={endpoint.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedEndpointIds.includes(endpoint.id)}
                    onChange={() => toggleEndpoint(endpoint.id)}
                  />
                  <span className="font-semibold">{endpoint.method}</span>
                  <span className="font-mono">{endpoint.path}</span>
                </label>
              ))}
              <p className="px-2 pt-1 text-xs text-slate-400">
                None selected means all {endpointIds.length} endpoints.
              </p>
            </div>
          </ControlGroup>

          <ControlGroup title="Maximum tests per endpoint">
            <Input
              type="number"
              min={1}
              max={50}
              value={maxTestsPerEndpoint}
              onChange={(event) =>
                setMaxTestsPerEndpoint(Math.min(50, Math.max(1, Number(event.target.value) || 1)))
              }
            />
            <p className="mt-2 text-xs text-slate-500">
              Useful coverage is prioritized; combinations are bounded.
            </p>
          </ControlGroup>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {executionError && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {executionError}
          </p>
        )}
      </section>

      {/* Phase 5 Execution Summary Bar */}
      {executionSummary && (
        <section className="panel-surface p-5 border-l-4 border-l-emerald-500">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold text-slate-900">Execution Summary</h3>
                <span className="text-xs font-normal text-slate-500">
                  (Duration: {(executionSummary.totalDurationMs / 1000).toFixed(2)}s)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Execution Status: Verifies live API reachability and captures HTTP responses. Contract schemas and
                assertion drift are evaluated in Response Validation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-slate-700">
                Total: <strong>{executionSummary.total}</strong>
              </span>
              <span className="rounded-md bg-blue-50 px-3 py-1.5 text-blue-700">
                Executed: <strong>{executionSummary.executed}</strong>
              </span>
              <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-700">
                Successful Executions: <strong>{executionSummary.passedExecution}</strong>
              </span>
              {executionSummary.failedExecution > 0 && (
                <span className="rounded-md bg-amber-50 px-3 py-1.5 text-amber-700">
                  Failed: <strong>{executionSummary.failedExecution}</strong>
                </span>
              )}
              {executionSummary.errors > 0 && (
                <span className="rounded-md bg-rose-50 px-3 py-1.5 text-rose-700">
                  Errors: <strong>{executionSummary.errors}</strong>
                </span>
              )}
              {executionSummary.skipped > 0 && (
                <span className="rounded-md bg-slate-100 px-3 py-1.5 text-slate-500">
                  Skipped: <strong>{executionSummary.skipped}</strong>
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Tests Table & Detail Inspector */}
      {tests.length ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.85fr)]">
          <section className="panel-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="font-semibold text-slate-900">
                Generated Tests <span className="text-sm font-normal text-slate-500">({tests.length})</span>
              </h3>
              <div className="text-xs text-slate-500">
                {Object.keys(executionResults).length} / {tests.length} executed
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Endpoint</th>
                    <th className="px-3 py-3">Expected</th>
                    <th className="px-3 py-3">Execution Status</th>
                    <th className="px-3 py-3 text-center">On</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((test) => {
                    const result = executionResults[test.id];
                    const isRunning = executingSingleId === test.id || (executing && !result);

                    return (
                      <tr
                        key={test.id}
                        onClick={() => setSelectedId(test.id)}
                        className={`cursor-pointer border-t border-slate-100 transition-colors ${
                          test.id === selectedId ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="max-w-60 px-4 py-3 font-medium text-slate-800 truncate" title={test.name}>
                          {test.name}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${typeStyle[test.type]}`}>
                            {test.type}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          <span className="font-semibold">{test.endpoint.method}</span> {test.endpoint.path}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {test.expected.statusCodes?.join(', ') ?? test.expected.statusClass ?? 'Documented'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {!result && !isRunning ? (
                            <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-400">
                              Not Run
                            </span>
                          ) : isRunning ? (
                            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 animate-pulse">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Running
                            </span>
                          ) : result?.status === 'PASSED_EXECUTION' ? (
                            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              HTTP {result.response?.status} ({result.durationMs}ms)
                            </span>
                          ) : result?.status === 'FAILED_EXECUTION' ? (
                            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800">
                              <AlertCircle className="h-3 w-3" />
                              {result.error?.type || 'Failed'}
                            </span>
                          ) : result?.status === 'SKIPPED' ? (
                            <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-500">
                              Skipped
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-rose-100 text-rose-800">
                              <XCircle className="h-3 w-3" />
                              Error
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            aria-label={`Enable ${test.name}`}
                            type="checkbox"
                            checked={test.enabled}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => update(test.id, { enabled: event.target.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selected ? (
            <Detail
              test={selected}
              executionResult={executionResults[selected.id]}
              isExecuting={executingSingleId === selected.id || executing}
              onRun={() => executeSingleTest(selected)}
              onUpdate={update}
              onDelete={remove}
            />
          ) : null}
        </div>
      ) : (
        <section className="panel-surface p-10 text-center text-sm text-slate-500">
          Choose categories and generate a test suite.
        </section>
      )}
    </div>
  );
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function Detail({
  test,
  executionResult,
  isExecuting,
  onRun,
  onUpdate,
  onDelete,
}: {
  test: TestCase;
  executionResult?: TestCaseExecutionResult;
  isExecuting: boolean;
  onRun: () => void;
  onUpdate: (id: string, change: Partial<TestCase>) => void;
  onDelete: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'config' | 'response' | 'request'>('config');

  const updateRequest = (change: Partial<TestCase['request']>) =>
    onUpdate(test.id, { request: { ...test.request, ...change } });

  return (
    <aside className="panel-surface p-6 flex flex-col gap-5">
      {/* Header & Execution Button */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-semibold text-slate-900">Test Details</h3>
          <p className="text-xs text-slate-500">Inspect configuration and execution output</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            onClick={onRun}
            disabled={isExecuting || !test.enabled}
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run Test
              </>
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(test.id)} aria-label="Delete test">
            <Trash2 className="h-4 w-4 text-rose-600" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-medium">
        <button
          className={`px-3 py-2 border-b-2 -mb-px transition-colors ${
            activeTab === 'config'
              ? 'border-violet-600 text-violet-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('config')}
        >
          Configuration
        </button>
        <button
          className={`px-3 py-2 border-b-2 -mb-px transition-colors ${
            activeTab === 'response'
              ? 'border-violet-600 text-violet-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('response')}
        >
          Execution Result {executionResult ? `(${executionResult.status})` : ''}
        </button>
        <button
          className={`px-3 py-2 border-b-2 -mb-px transition-colors ${
            activeTab === 'request'
              ? 'border-violet-600 text-violet-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setActiveTab('request')}
        >
          Sent Request (Sanitized)
        </button>
      </div>

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <label className="block text-xs font-medium text-slate-600">
            Name
            <Input
              className="mt-1"
              value={test.name}
              onChange={(event) => onUpdate(test.id, { name: event.target.value })}
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Description
            <textarea
              className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-700"
              value={test.description}
              onChange={(event) => onUpdate(test.id, { description: event.target.value })}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">
              Priority
              <select
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
                value={test.priority}
                onChange={(event) => onUpdate(test.id, { priority: event.target.value as TestCase['priority'] })}
              >
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-600">
              Expected Status
              <input
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs"
                value={test.expected.statusCodes?.join(', ') ?? ''}
                placeholder={test.expected.statusClass ?? 'Documented'}
                onChange={(event) =>
                  onUpdate(test.id, {
                    expected: {
                      ...test.expected,
                      statusCodes: event.target.value
                        .split(',')
                        .map((val) => val.trim())
                        .filter(Boolean),
                      statusClass: undefined,
                    },
                  })
                }
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-slate-600">
            Request URL
            <Input
              className="mt-1 text-xs font-mono"
              value={test.request.url}
              onChange={(event) => updateRequest({ url: event.target.value })}
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Request Body (JSON)
            <textarea
              className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 p-2.5 font-mono text-xs"
              value={test.request.body ?? ''}
              placeholder="null"
              onChange={(event) => updateRequest({ body: event.target.value || null })}
            />
          </label>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p>
              <strong>Endpoint:</strong> {test.endpoint.method} {test.endpoint.path}
            </p>
            <p>
              <strong>Query:</strong>{' '}
              {test.request.queryParams?.map((item) => `${item.key}=${item.value}`).join('&') || 'None'}
            </p>
            <p>
              <strong>Headers:</strong> {test.request.headers?.map((item) => item.key).join(', ') || 'None'}
            </p>
            <p>
              <strong>Auth Type:</strong> {test.request.auth.type}
            </p>
          </div>
        </div>
      )}

      {/* Response Tab */}
      {activeTab === 'response' && (
        <div className="space-y-4">
          {!executionResult ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
              <Clock className="mx-auto h-6 w-6 text-slate-400 mb-2" />
              This test has not been executed yet. Click &quot;Run Test&quot; above to execute it.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Header */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  {executionResult.status === 'PASSED_EXECUTION' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : executionResult.status === 'SKIPPED' ? (
                    <Clock className="h-5 w-5 text-slate-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {executionStatusBadge[executionResult.status]?.label ?? executionResult.status}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Duration: {executionResult.durationMs}ms
                    </div>
                  </div>
                </div>

                {executionResult.response && (
                  <div className="text-right">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                        executionResult.response.status >= 200 && executionResult.response.status < 300
                          ? 'bg-emerald-100 text-emerald-800'
                          : executionResult.response.status >= 400 && executionResult.response.status < 500
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      HTTP {executionResult.response.status} {executionResult.response.statusText}
                    </span>
                    {executionResult.response.size !== undefined && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Size: {executionResult.response.size} B
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Error Details if any */}
              {executionResult.error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <p className="font-semibold">Execution Failure: {executionResult.error.type}</p>
                  <p className="mt-1">{executionResult.error.message}</p>
                  {executionResult.error.details && (
                    <p className="mt-1 text-[11px] opacity-80">{executionResult.error.details}</p>
                  )}
                </div>
              )}

              {/* Response Body */}
              {executionResult.response && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    Response Body
                  </h4>
                  <pre className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100 font-mono">
                    {typeof executionResult.response.body === 'object'
                      ? JSON.stringify(executionResult.response.body, null, 2)
                      : String(executionResult.response.body || '(empty response)')}
                  </pre>
                </div>
              )}

              {/* Response Headers */}
              {executionResult.response?.headers && Object.keys(executionResult.response.headers).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-1">Response Headers</h4>
                  <div className="max-h-36 overflow-auto rounded-lg border border-slate-200 p-2 text-[11px] font-mono space-y-1 bg-white">
                    {Object.entries(executionResult.response.headers).map(([key, val]) => (
                      <div key={key} className="truncate text-slate-600">
                        <strong className="text-slate-800">{key}:</strong> {String(val)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sanitized Request Tab */}
      {activeTab === 'request' && (
        <div className="space-y-3 text-xs">
          {executionResult?.request ? (
            <div className="space-y-3">
              <div>
                <span className="font-semibold text-slate-700">Executed URL:</span>
                <p className="mt-0.5 font-mono text-[11px] text-slate-800 break-all bg-slate-50 p-2 rounded border border-slate-200">
                  {executionResult.request.method} {executionResult.request.url}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-700">Authentication:</span>
                <p className="mt-0.5 font-mono text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                  {executionResult.request.auth.description}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-700">Sanitized Headers:</span>
                <div className="mt-0.5 max-h-36 overflow-auto rounded border border-slate-200 p-2 bg-slate-50 font-mono text-[11px] space-y-1">
                  {executionResult.request.headers?.length ? (
                    executionResult.request.headers.map((h, i) => (
                      <div key={i} className="truncate">
                        <strong>{h.key}:</strong> {h.value}
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-400">None</span>
                  )}
                </div>
              </div>

              {executionResult.request.body && (
                <div>
                  <span className="font-semibold text-slate-700">Request Body:</span>
                  <pre className="mt-0.5 max-h-36 overflow-auto rounded border border-slate-200 p-2 bg-slate-50 font-mono text-[11px]">
                    {executionResult.request.body}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500">
              Run this test to view the exact sanitized request dispatched to the target API.
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
