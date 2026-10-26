import { cn } from "@/lib/utils";

type MethodBadgeProps = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE"; };

const methodStyles: Record<MethodBadgeProps["method"], string> = {
  GET: "bg-sky-500/10 text-sky-700 border-sky-200",
  POST: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  PUT: "bg-amber-500/10 text-amber-700 border-amber-200",
  PATCH: "bg-orange-500/10 text-orange-700 border-orange-200",
  DELETE: "bg-rose-500/10 text-rose-700 border-rose-200",
  HEAD: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
  OPTIONS: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  TRACE: "bg-slate-500/10 text-slate-700 border-slate-200",
};

export function MethodBadge({ method }: MethodBadgeProps) {
  return (
    <span className={cn("inline-flex min-w-16 justify-center rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide", methodStyles[method])}>
      {method}
    </span>
  );
}
