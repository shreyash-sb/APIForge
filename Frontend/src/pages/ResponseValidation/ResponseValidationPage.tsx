import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  Layers,
  Loader2,
  Radar,
  Search,
  ShieldCheck,
  TestTube2,
  XCircle,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { testExecutionService } from '@/services/testExecutionService';
import { validationService, ValidationApiError } from '@/services/validationService';
import { useAppStore } from '@/store/useAppStore';
import type { HttpMethod } from '@/types/request.types';
import type { TestCase, TestCaseType } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type {
  AssertionCategory,
  TestCaseValidationResult,
  ValidationStatus,
} from '@/types/validation.types';

function resolveTestCaseUrl(rawUrl: string | undefined): string {
  let url = (rawUrl || '').trim();
  if (!url) {
    return 'http://localhost:3001/api/mock/serve/api/users';
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://localhost:3001/api/mock/serve${url.startsWith('/') ? '' : '/'}${url}`;
  }
  // Replace any {id} or {param}
  url = url.replace(/\{[a-zA-Z0-9_-]+\}/g, '101');
  return url;
}

// Method badge colors
const methodColors: Record<string, string> = {
  GET: 'bg-sky-100 text-sky-800 border-sky-200',
  POST: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PUT: 'bg-amber-100 text-amber-800 border-amber-200',
  PATCH: 'bg-violet-100 text-violet-800 border-violet-200',
  DELETE: 'bg-rose-100 text-rose-800 border-rose-200',
  HEAD: 'bg-slate-100 text-slate-800 border-slate-200',
  OPTIONS: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

// Validation status badges
const validationStatusBadge: Record<
  ValidationStatus | 'UNVALIDATED',
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  VALIDATION_PASSED: {
    label: 'Contract Valid',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  VALIDATION_FAILED: {
    label: 'Contract Failed',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
  },
  NOT_VALIDATABLE: {
    label: 'Not Validatable',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertCircle,
  },
  SKIPPED: {
    label: 'Skipped',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
    icon: Clock,
  },
  UNVALIDATED: {
    label: 'Not Validated',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Clock,
  },
};

// Assertion category colors
const categoryBadge: Record<AssertionCategory, { label: string; className: string }> = {
  STATUS_CODE: { label: 'Status Code', className: 'bg-purple-100 text-purple-800' },
  HEADER: { label: 'Header', className: 'bg-indigo-100 text-indigo-800' },
  CONTENT_TYPE: { label: 'Content-Type', className: 'bg-cyan-100 text-cyan-800' },
  SCHEMA_TYPE: { label: 'Type Check', className: 'bg-blue-100 text-blue-800' },
  SCHEMA_REQUIRED: { label: 'Required Field', className: 'bg-orange-100 text-orange-800' },
  SCHEMA_CONSTRAINT: { label: 'Constraint', className: 'bg-amber-100 text-amber-800' },
  SCHEMA_ENUM: { label: 'Enum Match', className: 'bg-teal-100 text-teal-800' },
  SCHEMA_STRUCTURE: { label: 'JSON Schema', className: 'bg-slate-100 text-slate-800' },
};

// Test category styles
const typeStyle: Record<TestCaseType, string> = {
  POSITIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NEGATIVE: 'bg-rose-50 text-rose-700 border-rose-200',
  BOUNDARY: 'bg-amber-50 text-amber-700 border-amber-200',
  SECURITY: 'bg-violet-50 text-violet-700 border-violet-200',
  SCHEMA: 'bg-sky-50 text-sky-700 border-sky-200',
  PARAMETER: 'bg-slate-50 text-slate-700 border-slate-200',
};

type FilterStatus = 'ALL' | 'VALIDATION_PASSED' | 'VALIDATION_FAILED' | 'NOT_VALIDATABLE' | 'SKIPPED' | 'UNVALIDATED';

export function ResponseValidationPage() {
  const navigate = useNavigate();
  const specification = useAppStore((state) => state.activeSpecification);
  const generatedTests = useAppStore((state) => state.generatedTests);
  const executionResults = useAppStore((state) => state.executionResults);
  const updateExecutionResult = useAppStore((state) => state.updateExecutionResult);
  const validationResults = useAppStore((state) => state.validationResults);
  const updateValidationResult = useAppStore((state) => state.updateValidationResult);
  const setValidationResults = useAppStore((state) => state.setValidationResults);
  const validationSummary = useAppStore((state) => state.validationSuiteSummary);
  const setValidationSummary = useAppStore((state) => state.setValidationSuiteSummary);
  const setRequestDraft = useAppStore((state) => state.setRequestDraft);

  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | undefined>(
    () => generatedTests[0]?.id
  );

  useEffect(() => {
    if (!selectedTestCaseId && generatedTests.length > 0) {
      setSelectedTestCaseId(generatedTests[0]?.id);
    } else if (selectedTestCaseId && !generatedTests.some((t) => t.id === selectedTestCaseId)) {
      setSelectedTestCaseId(generatedTests[0]?.id);
    }
  }, [generatedTests, selectedTestCaseId]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [validatingBatch, setValidatingBatch] = useState(false);
  const [validatingSingleId, setValidatingSingleId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assertions' | 'response' | 'expectations'>('assertions');

  // Pair tests with their execution and validation results
  const pairedTests = useMemo(() => {
    return generatedTests.map((tc) => ({
      testCase: tc,
      executionResult: executionResults[tc.id] as TestCaseExecutionResult | undefined,
      validationResult: validationResults[tc.id] as TestCaseValidationResult | undefined,
    }));
  }, [generatedTests, executionResults, validationResults]);

  // Filtered tests based on search and status
  const filteredTests = useMemo(() => {
    return pairedTests.filter(({ testCase, validationResult, executionResult }) => {
      // Search matching
      const matchesSearch =
        testCase.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        testCase.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        testCase.endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
        testCase.endpoint.method.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Status matching
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'UNVALIDATED') {
        return executionResult && !validationResult;
      }
      return validationResult?.status === statusFilter;
    });
  }, [pairedTests, searchTerm, statusFilter]);

  // Selected test pair
  const currentPair = useMemo(() => {
    return pairedTests.find((p) => p.testCase.id === selectedTestCaseId) ?? pairedTests[0];
  }, [pairedTests, selectedTestCaseId]);

  // Live Summary calculation
  const calculatedSummary = useMemo(() => {
    const validated = Object.values(validationResults);
    const totalTests = pairedTests.length;
    const passedValidation = validated.filter((v) => v.status === 'VALIDATION_PASSED').length;
    const failedValidation = validated.filter((v) => v.status === 'VALIDATION_FAILED').length;
    const notValidatable = validated.filter((v) => v.status === 'NOT_VALIDATABLE').length;
    const skipped = validated.filter((v) => v.status === 'SKIPPED').length;
    const unvalidated = pairedTests.filter((p) => p.executionResult && !p.validationResult).length;

    const totalAssertions = validated.reduce((acc, v) => acc + v.summary.totalAssertions, 0);
    const passedAssertions = validated.reduce((acc, v) => acc + v.summary.passedAssertions, 0);
    const failedAssertions = validated.reduce((acc, v) => acc + v.summary.failedAssertions, 0);

    return {
      totalTests,
      validatedCount: validated.length,
      passedValidation,
      failedValidation,
      notValidatable,
      skipped,
      unvalidated,
      totalAssertions,
      passedAssertions,
      failedAssertions,
    };
  }, [pairedTests, validationResults]);

  // Open test case in Request Builder with fully resolved URL
  const handleOpenInRequestBuilder = (testCase: TestCase) => {
    const finalUrl = resolveTestCaseUrl(testCase.request.url);
    const queryParams = (testCase.request.queryParams || []).map((qp, idx) => ({
      id: (qp as { id?: string }).id || `qp-${idx}-${Date.now()}`,
      key: qp.key,
      value: qp.value,
      enabled: qp.enabled !== false,
    }));
    const headers = (testCase.request.headers || []).map((h, idx) => ({
      id: (h as { id?: string }).id || `h-${idx}-${Date.now()}`,
      key: h.key,
      value: h.value,
      enabled: h.enabled !== false,
    }));

    setRequestDraft({
      method: testCase.request.method as HttpMethod,
      url: finalUrl,
      queryParams,
      headers,
      body:
        typeof testCase.request.body === 'string'
          ? testCase.request.body
          : testCase.request.body !== undefined && testCase.request.body !== null
          ? JSON.stringify(testCase.request.body, null, 2)
          : '',
      auth: testCase.request.auth || { type: 'none' },
    });
    navigate('/request-builder');
  };

  // Validate a single test (automatically executes test first if unexecuted)
  const handleValidateSingle = async (testCase: TestCase, execResult?: TestCaseExecutionResult) => {
    setValidatingSingleId(testCase.id);
    setApiError(null);

    try {
      let activeExec = execResult;
      if (!activeExec) {
        const resolvedUrl = resolveTestCaseUrl(testCase.request.url);
        const executableTestCase: TestCase = {
          ...testCase,
          request: {
            ...testCase.request,
            url: resolvedUrl,
          },
        };
        activeExec = await testExecutionService.executeSingle(executableTestCase);
        updateExecutionResult(testCase.id, activeExec);
      }

      const result = await validationService.validateSingle(
        testCase,
        activeExec,
        specification?.schemas
      );
      updateValidationResult(testCase.id, result);
    } catch (err: unknown) {
      if (err instanceof ValidationApiError) {
        setApiError(`Validation API error: ${err.message}`);
      } else {
        setApiError(err instanceof Error ? err.message : 'An error occurred during validation.');
      }
    } finally {
      setValidatingSingleId(null);
    }
  };

  // Validate all executed tests in batch (runs unexecuted tests automatically)
  const handleValidateBatch = async () => {
    if (!generatedTests.length) {
      setApiError('No test cases available to validate.');
      return;
    }

    setValidatingBatch(true);
    setApiError(null);

    try {
      const currentExecutionMap = { ...executionResults };
      const unexecuted = generatedTests.filter((t) => !currentExecutionMap[t.id]);

      if (unexecuted.length > 0) {
        const batchToRun = unexecuted.map((t) => ({
          ...t,
          request: {
            ...t.request,
            url: resolveTestCaseUrl(t.request.url),
          },
        }));
        const suiteExec = await testExecutionService.executeBatch(batchToRun);
        for (const res of suiteExec.results) {
          currentExecutionMap[res.testCaseId] = res;
          updateExecutionResult(res.testCaseId, res);
        }
      }

      const executableItems = generatedTests
        .map((t) => ({
          testCase: t,
          executionResult: currentExecutionMap[t.id]!,
        }))
        .filter((item) => Boolean(item.executionResult));

      const batchResult = await validationService.validateBatch(
        executableItems,
        specification?.schemas
      );

      const resultMap: Record<string, TestCaseValidationResult> = {};
      for (const res of batchResult.results) {
        resultMap[res.testCaseId] = res;
      }
      setValidationResults(resultMap);
      setValidationSummary(batchResult.summary);
    } catch (err: unknown) {
      if (err instanceof ValidationApiError) {
        setApiError(`Batch validation API error: ${err.message}`);
      } else {
        setApiError(err instanceof Error ? err.message : 'An error occurred during batch validation.');
      }
    } finally {
      setValidatingBatch(false);
    }
  };

  // If no OpenAPI spec is active
  if (!specification) {
    return (
      <div className="space-y-6">
        <div className="panel-surface mx-auto max-w-2xl p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <FileCode2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-950">Import an OpenAPI Specification</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            APIForge validates API response bodies and headers against your normalized OpenAPI contract schemas and
            test expectations. Import a specification to begin.
          </p>
          <Link to="/openapi">
            <Button className="mt-5">Import OpenAPI Specification</Button>
          </Link>
        </div>
      </div>
    );
  }

  // If spec is active but no tests generated yet
  if (!generatedTests.length) {
    return (
      <div className="space-y-6">
        <div className="panel-surface mx-auto max-w-2xl p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <TestTube2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-950">No Generated Tests Available</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            The active specification <strong className="font-semibold text-slate-800">{specification.metadata.title}</strong> has
            not generated test cases yet. Visit the Test Generator to generate and execute tests.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/test-generator">
              <Button>
                <TestTube2 className="h-4 w-4" />
                Go to Test Generator
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const executedTestsCount = Object.keys(executionResults).length;

  return (
    <div className="space-y-6">
      {/* A. PAGE HEADER */}
      <section className="panel-surface p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
              <Radar className="h-4 w-4" />
              Contract Drift &amp; Schema Verification Engine
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">Response Validation</h1>
            <p className="mt-1 text-sm text-slate-500">
              Verify API execution responses against normalized OpenAPI contract schemas, status codes, and headers.
              {validationSummary ? (
                <span className="ml-2 font-mono text-xs text-blue-600 font-medium">
                  (Last batch: {validationSummary.passedValidation}/{validationSummary.totalTests} passed in {validationSummary.totalDurationMs}ms)
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/test-generator">
              <Button variant="outline" size="sm" className="h-10 px-4 text-xs font-semibold rounded-xl gap-2 border-slate-200">
                <ExternalLink className="h-4 w-4 text-slate-500" />
                Test Generator ({generatedTests.length})
              </Button>
            </Link>
            <Button
              variant="default"
              className="h-10 px-5 text-xs font-semibold rounded-xl gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              onClick={handleValidateBatch}
              disabled={validatingBatch || generatedTests.length === 0}
            >
              {validatingBatch ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating Suite...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Validate All Tests ({generatedTests.length})
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Global API error notification */}
        {apiError && (
          <div className="mt-4 flex items-start justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{apiError}</span>
            </div>
            <button
              onClick={() => setApiError(null)}
              className="ml-4 text-xs font-semibold text-rose-600 hover:text-rose-900"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Informational banner when tests are generated but not executed */}
        {executedTestsCount === 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>
                Tests are generated but not executed yet. Execute tests in the Test Generator to capture actual API responses for contract validation.
              </span>
            </div>
            <Link to="/test-generator">
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-900 hover:bg-amber-100">
                Run Tests Now
              </Button>
            </Link>
          </div>
        )}

        {/* D. VALIDATION SUMMARY STATS */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Tests</span>
              <Layers className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{calculatedSummary.totalTests}</div>
            <div className="mt-1 text-[11px] text-slate-400">{executedTestsCount} executed</div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-700">Passed</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-900">{calculatedSummary.passedValidation}</div>
            <div className="mt-1 text-[11px] text-emerald-700 font-medium">Valid contracts</div>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-rose-700">Failed</span>
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-1 text-2xl font-bold text-rose-900">{calculatedSummary.failedValidation}</div>
            <div className="mt-1 text-[11px] text-rose-700 font-medium">Contract mismatches</div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-700">Not Validatable</span>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-900">{calculatedSummary.notValidatable}</div>
            <div className="mt-1 text-[11px] text-amber-700 font-medium">Execution errors</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Skipped</span>
              <Clock className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{calculatedSummary.skipped}</div>
            <div className="mt-1 text-[11px] text-slate-500">Disabled tests</div>
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-indigo-700">Assertions</span>
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-1 text-2xl font-bold text-indigo-900">{calculatedSummary.totalAssertions}</div>
            <div className="mt-1 text-[11px] text-indigo-700">
              {calculatedSummary.passedAssertions} pass / {calculatedSummary.failedAssertions} fail
            </div>
          </div>
        </div>
      </section>

      {/* Main Split Layout: Left Test List & Filters, Right Assertion Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Test Case Browser (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="panel-surface p-4">
            {/* Search and Filters */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search tests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-2">
                {(
                  [
                    { id: 'ALL', label: 'All', count: pairedTests.length },
                    { id: 'VALIDATION_PASSED', label: 'Passed', count: calculatedSummary.passedValidation },
                    { id: 'VALIDATION_FAILED', label: 'Failed', count: calculatedSummary.failedValidation },
                    { id: 'NOT_VALIDATABLE', label: 'Error', count: calculatedSummary.notValidatable },
                    { id: 'UNVALIDATED', label: 'Pending', count: calculatedSummary.unvalidated },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      statusFilter === tab.id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Test Case List */}
            <div className="mt-3 divide-y divide-slate-100 max-h-[640px] overflow-y-auto pr-1">
              {filteredTests.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No tests matched the selected filters.
                </div>
              ) : (
                filteredTests.map(({ testCase, executionResult, validationResult }) => {
                  const isSelected = testCase.id === currentPair?.testCase.id;
                  const isValidatingThis = validatingSingleId === testCase.id;
                  const vStatus: ValidationStatus | 'UNVALIDATED' = validationResult
                    ? validationResult.status
                    : 'UNVALIDATED';
                  const badgeInfo = validationStatusBadge[vStatus];
                  const BadgeIcon = badgeInfo.icon;
                  const methodClass = methodColors[testCase.endpoint.method] || 'bg-slate-100 text-slate-700';

                  return (
                    <div
                      key={testCase.id}
                      onClick={() => setSelectedTestCaseId(testCase.id)}
                      className={`group cursor-pointer p-3 transition-all rounded-xl my-1 border ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/40 shadow-sm'
                          : 'border-transparent hover:border-slate-200 hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${methodClass}`}>
                              {testCase.endpoint.method}
                            </span>
                            <span className="font-mono text-[11px] text-slate-600 truncate max-w-[200px]" title={testCase.endpoint.path}>
                              {testCase.endpoint.path}
                            </span>
                            <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-medium border ${typeStyle[testCase.type]}`}>
                              {testCase.type}
                            </span>
                          </div>

                          <h3 className="mt-1 text-xs font-semibold text-slate-900 truncate" title={testCase.name}>
                            {testCase.name}
                          </h3>
                        </div>

                        {/* Validate Single Action Button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-[11px] text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                          disabled={isValidatingThis || validatingBatch}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleValidateSingle(testCase, executionResult);
                          }}
                          title={executionResult ? 'Validate response contract' : 'Execute & validate test'}
                        >
                          {isValidatingThis ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Bottom Status & Assertions Row */}
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${badgeInfo.className}`}
                          >
                            <BadgeIcon className="h-3 w-3" />
                            {badgeInfo.label}
                          </span>

                          {validationResult && (
                            <span className="text-[10px] text-slate-500">
                              {validationResult.summary.passedAssertions}/{validationResult.summary.totalAssertions} passed
                            </span>
                          )}
                        </div>

                        {executionResult ? (
                          <span className="text-[10px] text-slate-400">
                            HTTP {executionResult.response?.status ?? 'FAIL'} ({executionResult.durationMs}ms)
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-medium">Not run</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Assertion Details & Response Inspector (7 cols) */}
        <div className="space-y-5 lg:col-span-7">
          {currentPair ? (
            <div className="panel-surface p-6 sm:p-7">
              {/* Test Header */}
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded px-2.5 py-0.5 text-xs font-bold border ${methodColors[currentPair.testCase.endpoint.method] || 'bg-slate-100'}`}>
                      {currentPair.testCase.endpoint.method}
                    </span>
                    <span className="font-mono text-sm text-slate-800 break-all font-semibold">
                      {currentPair.testCase.endpoint.path}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${typeStyle[currentPair.testCase.type]}`}>
                      {currentPair.testCase.type}
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-bold text-slate-950">{currentPair.testCase.name}</h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {currentPair.testCase.id}</p>

                  {/* Target URL Banner */}
                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-2.5 font-mono text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-slate-400 select-none shrink-0 font-sans text-[11px] uppercase tracking-wider">Target URL:</span>
                      <span className="truncate text-blue-600 font-semibold">{resolveTestCaseUrl(currentPair.testCase.request.url)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs gap-1.5"
                    onClick={() => handleOpenInRequestBuilder(currentPair.testCase)}
                    title="Open this request in Request Builder to inspect parameters and send"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                    Test in Request Builder
                  </Button>
                  <Button
                    size="sm"
                    className="h-10 px-5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs gap-2"
                    disabled={
                      validatingSingleId === currentPair.testCase.id ||
                      validatingBatch
                    }
                    onClick={() => handleValidateSingle(currentPair.testCase, currentPair.executionResult)}
                  >
                    {validatingSingleId === currentPair.testCase.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running &amp; Validating...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        {currentPair.executionResult ? 'Validate Contract' : 'Run & Validate'}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Status Banner */}
              <div className="mt-5">
                {currentPair.validationResult ? (
                  <div
                    className={`rounded-xl border p-4 ${
                      currentPair.validationResult.status === 'VALIDATION_PASSED'
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                        : currentPair.validationResult.status === 'VALIDATION_FAILED'
                        ? 'border-rose-200 bg-rose-50/60 text-rose-900'
                        : currentPair.validationResult.status === 'NOT_VALIDATABLE'
                        ? 'border-amber-200 bg-amber-50/60 text-amber-900'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        {currentPair.validationResult.status === 'VALIDATION_PASSED' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        ) : currentPair.validationResult.status === 'VALIDATION_FAILED' ? (
                          <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                        )}
                        <div>
                          <div className="text-sm font-bold">
                            {currentPair.validationResult.status === 'VALIDATION_PASSED' &&
                              'All contract assertions passed successfully.'}
                            {currentPair.validationResult.status === 'VALIDATION_FAILED' &&
                              `Validation failed: ${currentPair.validationResult.summary.failedAssertions} assertion(s) did not match contract.`}
                            {currentPair.validationResult.status === 'NOT_VALIDATABLE' &&
                              'Not Validatable: Request failed or returned no response data.'}
                            {currentPair.validationResult.status === 'SKIPPED' &&
                              'Test was disabled and skipped.'}
                          </div>
                          <div className="mt-0.5 text-xs opacity-90">
                            Validated at {new Date(currentPair.validationResult.validatedAt).toLocaleTimeString()} ({currentPair.validationResult.durationMs}ms)
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-xs font-semibold">
                        {currentPair.validationResult.summary.passedAssertions} passed / {currentPair.validationResult.summary.totalAssertions} total
                      </div>
                    </div>
                  </div>
                ) : currentPair.executionResult ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-blue-900">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-xs font-medium">
                        HTTP response captured (Status {currentPair.executionResult.response?.status ?? 'N/A'}). Click &quot;Validate Contract&quot; to evaluate assertions.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-900 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-950">Awaiting Real Execution Response</p>
                        <p className="text-[11px] text-amber-800">Execute this test directly to capture live mock responses and validate against contract schemas.</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleValidateSingle(currentPair.testCase, undefined)}
                      disabled={validatingSingleId === currentPair.testCase.id}
                      className="h-9 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs gap-1.5"
                    >
                      {validatingSingleId === currentPair.testCase.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <TestTube2 className="h-3.5 w-3.5" />
                          Execute &amp; Validate Now
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Inspector Tabs */}
              <div className="mt-5 border-b border-slate-100 flex gap-4 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('assertions')}
                  className={`pb-2 transition-colors border-b-2 ${
                    activeTab === 'assertions'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Contract Assertions (
                  {currentPair.validationResult?.assertions.length ?? 0})
                </button>
                <button
                  onClick={() => setActiveTab('response')}
                  className={`pb-2 transition-colors border-b-2 ${
                    activeTab === 'response'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Actual Response Data
                </button>
                <button
                  onClick={() => setActiveTab('expectations')}
                  className={`pb-2 transition-colors border-b-2 ${
                    activeTab === 'expectations'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Contract Expectations
                </button>
              </div>

              {/* F & G: Assertions Tab (with Multiple Failure details) */}
              {activeTab === 'assertions' && (
                <div className="mt-4 space-y-3">
                  {!currentPair.validationResult ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      Run validation to inspect response contract assertions.
                    </div>
                  ) : currentPair.validationResult.assertions.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No assertions evaluated for this execution.
                    </div>
                  ) : (
                    currentPair.validationResult.assertions.map((assertion, idx) => {
                      const categoryInfo = categoryBadge[assertion.category] || {
                        label: assertion.category,
                        className: 'bg-slate-100 text-slate-700',
                      };

                      return (
                        <div
                          key={assertion.id || idx}
                          className={`rounded-xl border p-4 transition-all ${
                            assertion.passed
                              ? 'border-slate-200 bg-white hover:border-slate-300'
                              : 'border-rose-200 bg-rose-50/30 hover:border-rose-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {assertion.passed ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                              )}
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${categoryInfo.className}`}
                              >
                                {categoryInfo.label}
                              </span>
                              <span className="font-mono text-xs font-semibold text-slate-900 break-all">
                                {assertion.path}
                              </span>
                            </div>

                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                assertion.passed
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {assertion.passed ? 'PASSED' : 'FAILED'}
                            </span>
                          </div>

                          {/* Diagnostic Message */}
                          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                            {assertion.message}
                          </p>

                          {/* Expected vs Actual Comparison Grid */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                                Expected Contract
                              </span>
                              <div className="font-mono text-xs text-slate-800 break-all whitespace-pre-wrap">
                                {assertion.expected}
                              </div>
                            </div>

                            <div
                              className={`rounded-lg border p-2.5 ${
                                assertion.passed
                                  ? 'bg-slate-50 border-slate-200/80'
                                  : 'bg-rose-50 border-rose-200'
                              }`}
                            >
                              <span
                                className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${
                                  assertion.passed ? 'text-slate-400' : 'text-rose-500'
                                }`}
                              >
                                Actual Response
                              </span>
                              <div
                                className={`font-mono text-xs break-all whitespace-pre-wrap ${
                                  assertion.passed ? 'text-slate-800' : 'text-rose-900 font-semibold'
                                }`}
                              >
                                {assertion.actual}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Response Tab */}
              {activeTab === 'response' && (
                <div className="mt-4 space-y-4">
                  {currentPair.executionResult?.response ? (
                    <>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                          Status & Metadata
                        </h4>
                        <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Status:</span>
                            <span className="font-bold">{currentPair.executionResult.response.status} {currentPair.executionResult.response.statusText}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Response Time:</span>
                            <span>{currentPair.executionResult.response.responseTime} ms</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Payload Size:</span>
                            <span>{currentPair.executionResult.response.size} bytes</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                          Response Headers
                        </h4>
                        <pre className="rounded-lg bg-slate-900 text-slate-200 p-3 text-xs font-mono overflow-x-auto max-h-48">
                          {JSON.stringify(currentPair.executionResult.response.headers, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                          Response Body
                        </h4>
                        <pre className="rounded-lg bg-slate-900 text-emerald-400 p-3 text-xs font-mono overflow-x-auto max-h-64">
                          {typeof currentPair.executionResult.response.body === 'object' && currentPair.executionResult.response.body !== null
                            ? JSON.stringify(currentPair.executionResult.response.body, null, 2)
                            : String(currentPair.executionResult.response.body ?? '')}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No response captured. Execute this test to view response headers and body.
                    </div>
                  )}
                </div>
              )}

              {/* Expectations Tab */}
              {activeTab === 'expectations' && (
                <div className="mt-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Expected Status Codes
                    </h4>
                    <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800">
                      {currentPair.testCase.expected.statusCodes?.join(', ') ||
                        currentPair.testCase.expected.statusClass ||
                        '2xx (Default)'}
                    </div>
                  </div>

                  {currentPair.testCase.expected.headers && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                        Expected Headers Contract
                      </h4>
                      <pre className="rounded-lg bg-slate-900 text-slate-200 p-3 text-xs font-mono overflow-x-auto max-h-48">
                        {JSON.stringify(currentPair.testCase.expected.headers, null, 2)}
                      </pre>
                    </div>
                  )}

                  {currentPair.testCase.expected.responseSchema && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                        Expected Response Schema (OpenAPI Definition)
                      </h4>
                      <pre className="rounded-lg bg-slate-900 text-blue-400 p-3 text-xs font-mono overflow-x-auto max-h-64">
                        {JSON.stringify(currentPair.testCase.expected.responseSchema, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="panel-surface p-12 text-center text-slate-400 text-sm">
              Select a test from the left to view response contract validation details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
