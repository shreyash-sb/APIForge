import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StatsCardData } from "@/types/dashboard";

const toneClasses: Record<StatsCardData["tone"], string> = {
  primary: "bg-sky-500/10 text-sky-700",
  success: "bg-emerald-500/10 text-emerald-700",
  warning: "bg-amber-500/10 text-amber-700",
  ai: "bg-violet-500/10 text-violet-700",
};

export function StatCard({ title, value, change, trend, tone }: StatsCardData) {
  const TrendIcon = trend === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="panel-surface p-5 transition-transform duration-200 hover:-translate-y-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={cn("rounded-xl p-2", toneClasses[tone])}>
          <TrendIcon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">{change}</p>
    </div>
  );
}
