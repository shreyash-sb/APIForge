import { Send } from "lucide-react";
import type { RecentRequest } from "@/types/dashboard";
import { MethodBadge } from "./MethodBadge";
import { StatusBadge } from "./StatusBadge";

type RequestTableProps = {
  requests: RecentRequest[];
};

export function RequestTable({ requests }: RequestTableProps) {
  if (!requests.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-12 px-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-2.5">
          <Send className="h-5 w-5" />
        </div>
        <p className="text-xs font-semibold text-slate-600">No recorded executions yet. Run a generated test or workflow to see sanitized request activity.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-400">
          <tr>
            <th className="pb-3 font-medium">Method</th>
            <th className="pb-3 font-medium">Endpoint</th>
            <th className="pb-3 font-medium">Collection</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Response Time</th>
            <th className="pb-3 font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={`${request.method}-${request.endpoint}-${request.time}`} className="border-b border-slate-100 last:border-b-0">
              <td className="py-4 pr-4">
                <MethodBadge method={request.method} />
              </td>
              <td className="py-4 pr-4 font-medium text-slate-950">{request.endpoint}</td>
              <td className="py-4 pr-4 text-slate-600">{request.collection}</td>
              <td className="py-4 pr-4">
                {request.status ? <StatusBadge status={request.status} /> : <span className="text-xs font-medium text-rose-700">{request.outcome ?? 'No response'}</span>}
              </td>
              <td className="py-4 pr-4 text-slate-600">{request.responseTime}</td>
              <td className="py-4 text-slate-500">{new Date(request.time).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
