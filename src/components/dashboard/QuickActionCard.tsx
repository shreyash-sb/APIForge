import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { QuickAction } from "@/types/dashboard";

export function QuickActionCard({ title, description, icon: Icon, path }: QuickAction) {
  return (
    <Link
      to={path}
      className="panel-surface group flex h-full flex-col gap-4 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl bg-slate-100 p-3 text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-700" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </Link>
  );
}
