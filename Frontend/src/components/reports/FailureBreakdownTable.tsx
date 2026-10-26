import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import type { FailureBreakdownItem } from '@/types/report.types';
export function FailureBreakdownTable({ failures }: { failures: FailureBreakdownItem[] }) {
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
          <thead className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
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
            {items.map((item) => (
              <tr key={item.testCaseId} className="transition-colors hover:bg-slate-50/60 align-top">
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
                </td>
                <td className="px-4 py-3.5 text-xs font-semibold text-slate-800">
                  {item.failedAssertionCount}
                </td>
                <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                  {item.diagnosisId ? (
                    <Link className="font-medium text-violet-700 hover:underline" to="/ai-assistant">
                      View diagnosis
                    </Link>
                  ) : item.validationStatus === 'VALIDATION_FAILED' ? (
                    <Link className="font-medium text-sky-700 hover:underline" to="/response-validation">
                      View validation
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs font-medium whitespace-nowrap text-slate-700">
                  {item.aiSeverity ?? '—'}
                </td>
              </tr>
            ))}
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
