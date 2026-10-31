import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: number;
};

function getStatusStyles(status: number) {
  if (status >= 200 && status < 300) return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
  if (status >= 500) return "bg-rose-500/10 text-rose-700 border-rose-200";
  return "bg-amber-500/10 text-amber-700 border-amber-200";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={cn("inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold", getStatusStyles(status))}>{status}</span>;
}
