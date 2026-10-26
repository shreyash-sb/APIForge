import { Activity, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatsCardData } from "@/types/dashboard";

const toneConfig: Record<StatsCardData["tone"], { bg: string; text: string; icon: React.ElementType }> = {
  primary: { bg: "bg-blue-50 border-blue-200/80", text: "text-blue-600", icon: CheckCircle2 },
  success: { bg: "bg-emerald-50 border-emerald-200/80", text: "text-emerald-600", icon: Activity },
  warning: { bg: "bg-amber-50 border-amber-200/80", text: "text-amber-600", icon: AlertTriangle },
  ai:      { bg: "bg-purple-50 border-purple-200/80", text: "text-purple-600", icon: Sparkles },
};

export function StatCard({ title, value, change, tone }: StatsCardData) {
  const config = toneConfig[tone] ?? toneConfig.primary;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", config.bg, config.text)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">{title}</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-xl font-bold tracking-tight text-slate-900">{value}</span>
          <span className="text-[11px] text-slate-400 truncate">{change}</span>
        </div>
      </div>
    </div>
  );
}
