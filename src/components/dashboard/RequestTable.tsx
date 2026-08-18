import type { RecentRequest } from "@/types/dashboard";
import { MethodBadge } from "./MethodBadge";
import { StatusBadge } from "./StatusBadge";

type RequestTableProps = {
  requests: RecentRequest[];
};

export function RequestTable({ requests }: RequestTableProps) {
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
                <StatusBadge status={request.status} />
              </td>
              <td className="py-4 pr-4 text-slate-600">{request.responseTime}</td>
              <td className="py-4 text-slate-500">{request.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
