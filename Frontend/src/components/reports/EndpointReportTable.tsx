import { MethodBadge } from '@/components/dashboard/MethodBadge';
import type { EndpointReportItem } from '@/types/report.types';
const statusClass: Record<string, string> = { PASSED: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-rose-100 text-rose-700', PARTIAL: 'bg-amber-100 text-amber-700', UNTESTED: 'bg-slate-100 text-slate-600' };
export function EndpointReportTable({ endpoints }: { endpoints: EndpointReportItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Method</th>
            <th className="px-4 py-3 font-medium">Endpoint</th>
            <th className="px-4 py-3 font-medium">Tests</th>
            <th className="px-4 py-3 font-medium">Execution</th>
            <th className="px-4 py-3 font-medium">Validation</th>
            <th className="px-4 py-3 font-medium">Pass rate</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {endpoints.map((item) => (
            <tr key={`${item.method}${item.path}`} className="transition-colors hover:bg-slate-50/60">
              <td className="px-4 py-3.5 whitespace-nowrap">
                <MethodBadge method={item.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} />
              </td>
              <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                {item.path}
              </td>
              <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                {item.totalTests}
              </td>
              <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                {item.executionPassed}/{item.executionPassed + item.executionFailed}
              </td>
              <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                {item.validationPassed}/{item.validationPassed + item.validationFailed}
              </td>
              <td className="px-4 py-3.5 font-medium text-slate-800 whitespace-nowrap">
                {item.passPercentage === null ? '—' : `${item.passPercentage}%`}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass[item.overallStatus]}`}>
                  {item.overallStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
