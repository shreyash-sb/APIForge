import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import type { AiAction } from "@/types/dashboard";

type AIAssistantCardProps = {
  actions: AiAction[];
};

export function AIAssistantCard({ actions }: AIAssistantCardProps) {
  return (
    <div className="panel-surface relative overflow-hidden p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.12),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.08),transparent_40%)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
              <Sparkles className="h-3.5 w-3.5" />
              AI Assistant
            </div>
            <h3 className="mt-4 text-xl font-semibold text-slate-950">Get intelligent explanations, test cases and API insights.</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Bring AI directly into your API workflow for faster debugging, payload drafting, and documentation support.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {actions.map((action) => (
            <div key={action.title} className="rounded-xl border border-white/70 bg-white/80 p-4 shadow-soft">
              <p className="font-semibold text-slate-950">{action.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{action.description}</p>
            </div>
          ))}
        </div>
        <Link
          to="/ai-assistant"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 transition-colors hover:text-violet-900"
        >
          Open AI Assistant
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
