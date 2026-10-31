import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import type { FailureBreakdownItem } from '@/types/report.types';
import type { AiProviderName, AiProviderStatus, DiagnosisResult } from '@/types/diagnosis.types';
import type { DiagnosisEligibility } from '@/lib/diagnosisSelection';

/** Provenance label; mock and fallback output are never presented as Gemini. */
export function describeDiagnosisSource(provider?: AiProviderName, providerStatus?: AiProviderStatus): string {
  const status = providerStatus ?? (provider === 'google-gemini' ? 'live' : 'mock');
  if (status === 'live') return 'Gemini';
  if (status === 'fallback') return 'Fallback (Gemini unavailable)';
  return 'Mock/demo';
}

const ineligibleLabel: Record<string, string> = {
  passed: 'Passed — not diagnosed',
  'not-executed': 'Not executed',
  'no-failed-assertions': 'No failed assertions',
  'stale-validation': 'Validation is from another run',
  'already-diagnosed': 'Diagnosed',
};

interface FailureBreakdownTableProps {
  failures: FailureBreakdownItem[];
  /** Session diagnoses, used for the detail view only when the diagnosisId matches the report row */
  diagnoses?: Record<string, DiagnosisResult>;
  eligibility?: Record<string, DiagnosisEligibility>;
  onDiagnose?: (testCaseIds: string[]) => void;
  diagnosing?: boolean;
  failedDiagnosisIds?: string[];
}

export function FailureBreakdownTable({ failures, diagnoses = {}, eligibility = {}, onDiagnose, diagnosing = false, failedDiagnosisIds = [] }: FailureBreakdownTableProps) {
  const [expanded, setExpanded] = useState<string>();
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [execution, setExecution] = useState('ALL');
  const [validation, setValidation] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [severity, setSeverity] = useState('ALL');

  const values = (select: (item: FailureBreakdownItem) => string | undefined) =>
    [...new Set(failures.map(select).filter(Boolean))] as string[];

  const select = (value: string, update: (value: string) => void, options: string[], placeholder: string) => (
    <select
      aria-label={placeholder}
      className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
      value={value}
      onChange={(e) => update(e.target.value)}
    >
      <option value="ALL">{placeholder}: ALL</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );

  const items = useMemo(
    () =>
      failures
        .filter(
          (item) =>
            (method === 'ALL' || item.method === method) &&
            (type === 'ALL' || item.testType === type) &&
            (execution === 'ALL' || item.executionStatus === execution) &&
            (validation === 'ALL' || item.validationStatus === validation) &&
            (category === 'ALL' || item.failedAssertionCategories.includes(category as never)) &&
            (severity === 'ALL' || item.aiSeverity === severity) &&
            `${item.testName} ${item.path} ${item.failedAssertionCategories.join(' ')}`
              .toLowerCase()
              .includes(search.toLowerCase())
        )
        .slice(0, 200),
    [failures, search, method, type, execution, validation, category, severity]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search failures..."
          className="h-9 max-w-xs text-xs bg-white"
        />
        {select(method, setMethod, values((item) => item.method), 'Method')}
        {select(type, setType, values((item) => item.testType), 'Type')}
        {select(execution, setExecution, values((item) => item.executionStatus), 'Execution')}
        {select(validation, setValidation, values((item) => item.validationStatus), 'Validation')}
        {select(
          category,
          setCategory,
          [...new Set(failures.flatMap((item) => item.failedAssertionCategories))],
          'Category'
        )}
        {select(severity, setSeverity, values((item) => item.aiSeverity), 'Severity')}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Test</th>
              <th className="px-4 py-3 font-medium">Endpoint</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Assertions</th>
              <th className="px-4 py-3 font-medium">AI diagnosis</th>
              <th className="px-4 py-3 font-medium">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const detail = item.diagnosisId && diagnoses[item.testCaseId]?.diagnosisId === item.diagnosisId ? diagnoses[item.testCaseId] : undefined;
              const rowEligibility = eligibility[item.testCaseId];
              const isExpanded = expanded === item.testCaseId;
              return (
              <Fragment key={item.testCaseId}>
              <tr className="transition-colors hover:bg-slate-50/60 align-top">
                <td className="px-4 py-3.5 font-medium text-slate-800">
                  {item.testName}
                  <p className="mt-1 text-xs text-slate-500">
                    {item.testType} · {item.priority}
                  </p>
                </td>
                <td className="px-4 py-3.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                  <span className="font-semibold text-slate-900">{item.method}</span> {item.path}
                </td>
                <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                  <span className="font-medium text-slate-800">{item.executionStatus ?? 'Not executed'}</span>
                  <p className="mt-1 text-slate-500">{item.validationStatus}</p>
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-600">
                  {item.failedAssertionCategories.join(', ') || 'Execution issue'}
                  {item.message && <p className="mt-1 max-w-[260px] text-[11px] text-slate-500">{item.message}</p>}
                  {(item.expected || item.actual) && (
                    <p className="mt-0.5 max-w-[260px] font-mono text-[11px] text-slate-500">
                      Expected {item.expected ?? '—'} · Actual {item.actual ?? '—'}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs font-semibold text-slate-800">
                  {item.failedAssertionCount}
                </td>
                <td className="px-4 py-3.5 text-xs">
                  {item.diagnosisId ? (
                    <div className="max-w-[280px] space-y-1">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                          (item.aiProviderStatus ?? (item.aiProvider === 'google-gemini' ? 'live' : 'mock')) === 'live'
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {describeDiagnosisSource(item.aiProvider, item.aiProviderStatus)}
                        {item.aiConfidence ? ` · ${item.aiConfidence} confidence` : ''}
                      </span>
                      {item.aiDiagnosisSummary && <p className="line-clamp-2 text-slate-700">{item.aiDiagnosisSummary}</p>}
                      <button
                        type="button"
                        className="font-medium text-violet-700 hover:underline"
                        aria-expanded={isExpanded}
                        onClick={() => setExpanded(isExpanded ? undefined : item.testCaseId)}
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1 whitespace-nowrap">
                      <span className="text-slate-500">
                        {failedDiagnosisIds.includes(item.testCaseId)
                          ? 'Diagnosis failed'
                          : rowEligibility && !rowEligibility.eligible && rowEligibility.reason !== 'already-diagnosed'
                            ? `Not diagnosed · ${ineligibleLabel[rowEligibility.reason]}`
                            : 'Not diagnosed'}
                      </span>
                      {rowEligibility?.eligible && onDiagnose && (
                        <button
                          type="button"
                          className="block font-medium text-violet-700 hover:underline disabled:text-slate-400"
                          disabled={diagnosing}
                          onClick={() => onDiagnose([item.testCaseId])}
                        >
                          {failedDiagnosisIds.includes(item.testCaseId) ? 'Retry diagnosis' : 'Diagnose'}
                        </button>
                      )}
                      {item.validationStatus === 'VALIDATION_FAILED' && (
                        <Link className="block font-medium text-sky-700 hover:underline" to="/response-validation">
                          View validation
                        </Link>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs font-medium whitespace-nowrap text-slate-700">
                  {item.aiSeverity ?? '—'}
                </td>
              </tr>
              {isExpanded && (
                <tr className="bg-violet-50/30">
                  <td colSpan={7} className="px-4 py-3 text-xs text-slate-700">
                    {detail ? (
                      <div className="space-y-2">
                        <p className="font-semibold text-slate-800">
                          AI diagnosis (advisory) · {describeDiagnosisSource(detail.provider, detail.providerStatus)} · diagnosed{' '}
                          {new Date(detail.diagnosedAt).toLocaleString()}
                        </p>
                        {detail.fallbackReason && <p className="text-amber-700">Gemini could not answer: {detail.fallbackReason}. Deterministic fallback shown.</p>}
                        <p>{detail.summary}</p>
                        {detail.findings.length ? (
                          <ul className="space-y-1.5">
                            {detail.findings.map((finding) => (
                              <li key={finding.id} className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="font-semibold">
                                  [{finding.severity}] {finding.title}
                                </p>
                                <p className="mt-0.5 text-slate-600">{finding.explanation}</p>
                                {finding.suggestion && <p className="mt-0.5 text-emerald-700">Suggested fix: {finding.suggestion}</p>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-500">No findings were returned.</p>
                        )}
                        <p className="text-[11px] text-slate-500">AI findings are advisory. Deterministic validation remains the source of truth for pass/fail.</p>
                      </div>
                    ) : (
                      <p className="text-slate-500">Diagnosis details are not available in this browser session for this report row.</p>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        {failures.length > 200 && (
          <p className="p-3 text-xs text-slate-500 bg-slate-50/50 border-t border-slate-100">
            Showing the first 200 matching failures.
          </p>
        )}
      </div>
    </div>
  );
}
