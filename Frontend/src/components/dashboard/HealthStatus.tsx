import { cn } from "@/lib/utils";
import type { ApiHealthItem } from "@/types/dashboard";

type HealthStatusProps = {
  items: ApiHealthItem[];
};

const statusStyles: Record<ApiHealthItem["status"], string> = {
  Healthy: "bg-emerald-500 text-emerald-500",
  Degraded: "bg-amber-500 text-amber-600",
  Incident: "bg-rose-500 text-rose-600",
  Unknown: "bg-slate-400 text-slate-600",
  "Not monitored": "bg-slate-400 text-slate-600",
  Unavailable: "bg-rose-500 text-rose-600",
};

export function HealthStatus({ items }: HealthStatusProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.service} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", statusStyles[item.status].split(" ")[0])} />
            <p className="font-medium text-slate-950">{item.service}</p>
          </div>
          <span className={cn("ml-auto text-sm font-medium", statusStyles[item.status].split(" ")[1])}>{item.status}</span>
          <span className="min-w-16 text-right text-xs text-slate-500">{item.responseTime}</span>
        </div>
      ))}
    </div>
  );
}
