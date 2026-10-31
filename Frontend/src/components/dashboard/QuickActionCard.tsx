import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { QuickAction } from "@/types/dashboard";

export function QuickActionCard({ title, description, icon: Icon, path }: QuickAction) {
  return (
    <Link
      to={path}
      className="panel-surface group flex h-full flex-col justify-between gap-3 p-[18px] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-700" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
    </Link>
  );
}
