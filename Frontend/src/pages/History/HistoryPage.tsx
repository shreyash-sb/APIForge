import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { History, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MethodBadge } from "@/components/dashboard/MethodBadge";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useAppStore } from "@/store/useAppStore";
import { getHistoryItems, type HistoryItem } from "@/lib/historyData";

export function HistoryPage() {
  const { executionResults, workflowExecutionResult, manualRequestExecutions } = useAppStore();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [statusCodeFilter, setStatusCodeFilter] = useState<'All' | '2xx' | '4xx' | '5xx'>('All');
  const [selected, setSelected] = useState<HistoryItem>();

  const items = useMemo(
    () => getHistoryItems(executionResults, workflowExecutionResult, manualRequestExecutions),
    [executionResults, workflowExecutionResult, manualRequestExecutions]
  );

  const filtered = items.filter((item) => {
    const matchesType = type === 'All' || item.type === type;
    const matchesStatus = status === 'All' || item.status === status;
    const matchesSearch = `${item.method} ${item.endpoint}`.toLowerCase().includes(search.toLowerCase());
    const matchesMethod = methodFilter === 'All' || item.method.toUpperCase() === methodFilter;
    let matchesCode = true;
    if (statusCodeFilter === '2xx') {
      matchesCode = typeof item.httpStatus === 'number' && item.httpStatus >= 200 && item.httpStatus < 300;
    } else if (statusCodeFilter === '4xx') {
      matchesCode = typeof item.httpStatus === 'number' && item.httpStatus >= 400 && item.httpStatus < 500;
    } else if (statusCodeFilter === '5xx') {
      matchesCode = typeof item.httpStatus === 'number' && item.httpStatus >= 500 && item.httpStatus < 600;
    }
    return matchesType && matchesStatus && matchesSearch && matchesMethod && matchesCode;
  });

  const selectClass =
    "h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30";

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <section className="panel-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Execution History</h2>
            <p className="text-xs text-slate-500">
              Audit log of dispatched HTTP requests and test runs ({filtered.length} of {items.length} shown)
            </p>
          </div>
          <Link to="/request-builder" className="shrink-0">
            <Button size="sm" className="h-8.5 gap-1.5 text-xs font-medium">
              <Send className="h-3.5 w-3.5" />
              Request Builder
            </Button>
          </Link>
        </div>

        {/* Compact Filter Toolbar */}
        <div className="grid gap-2.5 sm:grid-cols-4 pt-1">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              aria-label="Search history"
              placeholder="Search endpoint or method..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8.5 text-xs bg-white"
            />
          </div>
          <select
            aria-label="Execution type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClass}
          >
            <option>All Types</option>
            <option>Manual request</option>
            <option>Generated test</option>
            <option>Workflow step</option>
          </select>
          <select
            aria-label="Execution status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClass}
          >
            <option>All Statuses</option>
            {[...new Set(items.map((item) => item.status))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>

        {/* Interactive Method & Status Code Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Method:</span>
            {['All', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethodFilter(m)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                  methodFilter === m
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Status Code:</span>
            {(
              [
                { id: 'All', label: 'All Codes' },
                { id: '2xx', label: '2xx Success' },
                { id: '4xx', label: '4xx Client Err' },
                { id: '5xx', label: '5xx Server Err' },
              ] as const
            ).map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => setStatusCodeFilter(sc.id)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                  statusCodeFilter === sc.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Table or Empty State */}
      {!items.length ? (
        <section className="rounded-2xl border border-dashed border-slate-200/80 bg-white/50 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <History className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">No recorded executions yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Send a request from the Request Builder or run generated tests to see execution history.
          </p>
        </section>
      ) : (
        <section className="panel-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Method</th>
                  <th className="px-5 py-3.5 font-medium">Endpoint</th>
                  <th className="px-5 py-3.5 font-medium">Type</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                  <th className="px-5 py-3.5 font-medium">Duration</th>
                  <th className="px-5 py-3.5 font-medium">Timestamp</th>
                  <th className="px-5 py-3.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <MethodBadge method={item.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap max-w-xs truncate">
                      {item.endpoint}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                      {item.type}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {typeof item.httpStatus === 'number' ? (
                        <StatusBadge status={item.httpStatus} />
                      ) : (
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {item.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {item.durationMs} ms
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setSelected(item)}>
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <p className="py-10 text-center text-sm text-slate-500">No history matches these filters.</p>
          )}
        </section>
      )}

      {/* Diagnostic Details Panel */}
      {selected && (
        <section className="panel-surface p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Safe diagnostic details</h2>
              <p className="text-xs text-slate-500">Inspection snapshot for selected execution</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700" onClick={() => setSelected(undefined)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Execution Type</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{selected.type}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Endpoint</p>
              <p className="mt-1 font-mono text-xs font-medium text-slate-800 truncate">{selected.endpoint}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{selected.httpStatus ?? selected.status}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Validation</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{selected.validationStatus ?? 'Not recorded'}</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Diagnostic Details</p>
            <p className="mt-1 font-mono text-xs text-slate-700 whitespace-pre-wrap">{selected.error ?? 'No diagnostic recorded'}</p>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Headers, bodies, credentials, and hosts are intentionally unavailable; this record cannot be replayed safely.
          </p>
        </section>
      )}
    </div>
  );
}
