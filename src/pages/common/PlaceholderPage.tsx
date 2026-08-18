import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";

type PlaceholderPageProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div className="panel-surface p-6 lg:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Phase 1 Foundation</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <EmptyState
        icon={icon}
        title={`${title} is coming in the next phase`}
        description="This area is already routed and styled so the product can expand cleanly as backend features and workflows are added."
        actionLabel="Explore Dashboard"
        actionPath="/dashboard"
      />
    </div>
  );
}
