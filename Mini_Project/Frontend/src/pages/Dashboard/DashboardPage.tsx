import { ArrowRight, Download, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AIAssistantCard } from "@/components/dashboard/AIAssistantCard";
import { ApiActivityChart } from "@/components/dashboard/ApiActivityChart";
import { HealthStatus } from "@/components/dashboard/HealthStatus";
import { CollectionCard } from "@/components/dashboard/CollectionCard";
import { QuickActionCard } from "@/components/dashboard/QuickActionCard";
import { RequestTable } from "@/components/dashboard/RequestTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { buttonVariants } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import {
  aiAssistantActions,
  quickActions,
} from "@/data/mockData";
import { getActivity, getDashboardStats, getExecutionEvents, getRecentRequests } from "@/lib/dashboardData";
import { checkBackendHealth, type HealthCheck } from "@/services/healthService";

export function DashboardPage() {
  const { generatedTests, executionResults, validationResults, diagnosisResults, workflowExecutionResult, manualRequestExecutions, collections } = useAppStore();
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const refreshHealth = async () => { setHealthLoading(true); setHealth(await checkBackendHealth()); setHealthLoading(false); };
  useEffect(() => { void refreshHealth(); }, []);
  const events = getExecutionEvents(executionResults, workflowExecutionResult, manualRequestExecutions);
  const liveStats = getDashboardStats(executionResults, validationResults, diagnosisResults);
  const activity = getActivity(events);
  const recentRequests = getRecentRequests(events);
  return (
    <div className="space-y-6">
      <section className="panel-surface overflow-hidden p-6 lg:p-8">
        <div className="absolute" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Control Center
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Good morning, Developer 👋</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{events.length ? "Activity and request history include recorded tests, workflows, and Request Builder requests. Test metrics remain test-only." : generatedTests.length ? "Run and validate generated tests to populate workspace metrics." : "Import an OpenAPI specification or send a request to begin."}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/request-builder" className={buttonVariants({ size: "lg" })}>
              <Plus className="h-4 w-4" />
              New Request
            </Link>
            <Link to="/openapi" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Download className="h-4 w-4" />
              Import OpenAPI
            </Link>
            {events.length ? <Link to="/reports" className={buttonVariants({ variant: "outline", size: "lg" })}>View Full Report<ArrowRight className="h-4 w-4" /></Link> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{liveStats.map((stat) => <StatCard key={stat.title} {...stat} />)}</section>

      <section className="space-y-4">
        <SectionHeader
          title="Quick Actions"
          description="Start common API workflows without digging through menus."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <QuickActionCard key={action.title} {...action} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <div className="panel-surface p-6">
          <SectionHeader
            title="API Activity"
            description="Recorded tests, workflows, and Request Builder requests in the last seven days. HTTP errors and transport failures are separate."
          />
          <div className="mt-6">
            <ApiActivityChart data={activity} />
          </div>
        </div>

        <div className="panel-surface p-6">
          <SectionHeader
            title="API Health"
            description="Explicit APIForge backend health check; ordinary API requests do not imply service health."
            action={<button className="text-sm text-sky-700" onClick={() => void refreshHealth()} disabled={healthLoading}>{healthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>}
          />
          <div className="mt-6">
            {healthLoading ? <p className="text-sm text-slate-500">Checking APIForge backend…</p> : <><HealthStatus items={[{ service: 'APIForge backend', status: health?.status ?? 'Unknown', responseTime: health?.responseTime ?? '—' }]} />{health?.error ? <p className="mt-3 text-sm text-rose-600">{health.error}</p> : null}</>}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <div className="panel-surface p-6">
          <SectionHeader
            title="Recent Requests"
            description="Recorded tests, workflows, and Request Builder requests. URLs are redacted before display."
            action={
              <Link to="/history" className={buttonVariants({ variant: "ghost" })}>
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="mt-6">
            <RequestTable requests={recentRequests} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel-surface p-6">
            <SectionHeader
              title="Recent Collections"
              description="Recently updated API collections."
            />
            <div className="mt-6 space-y-3">
              {collections.length ? collections.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 4).map((collection) => <CollectionCard key={collection.id} name={collection.name} requests={collection.requests.length} updatedAt={new Date(collection.updatedAt).toLocaleString()} accent="bg-sky-500/10 text-sky-700" to={`/collections#${collection.id}`} />) : <p className="py-4 text-sm text-slate-500">No saved collections yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section>
        <AIAssistantCard actions={aiAssistantActions} />
      </section>
    </div>
  );
}
