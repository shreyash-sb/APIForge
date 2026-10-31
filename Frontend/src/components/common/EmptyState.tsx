import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionPath?: string;
};

export function EmptyState({ icon: Icon, title, description, actionLabel, actionPath }: EmptyStateProps) {
  return (
    <div className="panel-surface flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {actionLabel && actionPath ? (
        <Link to={actionPath} className={buttonVariants({ variant: "outline", className: "mt-6" })}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
