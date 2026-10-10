import { FolderKanban } from "lucide-react";

import type { CollectionSummary } from "@/types/dashboard";

export function CollectionCard({ name, requests, updatedAt, accent }: CollectionSummary) {
  return (
    <div className="panel-surface flex items-center gap-4 p-4 transition-transform duration-200 hover:-translate-y-1">
      <div className={`rounded-xl p-3 ${accent}`}>
        <FolderKanban className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-950">{name}</p>
        <p className="text-sm text-slate-500">{requests} requests</p>
      </div>
      <p className="ml-auto text-xs text-slate-400">{updatedAt}</p>
    </div>
  );
}
