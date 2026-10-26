import { FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";

import type { CollectionSummary } from "@/types/dashboard";

export function CollectionCard({ name, requests, updatedAt, accent, to }: CollectionSummary & { to?: string }) {
  const content = (
    <div className="panel-surface flex items-center gap-3.5 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
      <div className={`rounded-xl p-2.5 shrink-0 ${accent}`}>
        <FolderKanban className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-sm text-slate-900">{name}</p>
        <p className="text-xs text-slate-500">{requests} {requests === 1 ? 'request' : 'requests'}</p>
      </div>
      <p className="ml-auto text-[11px] font-medium text-slate-400 shrink-0">{updatedAt}</p>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
