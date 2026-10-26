import {
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiActivityChart } from "@/components/dashboard/ApiActivityChart";
import { HealthStatus } from "@/components/dashboard/HealthStatus";
import { CollectionCard } from "@/components/dashboard/CollectionCard";
import { RequestTable } from "@/components/dashboard/RequestTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { getActivity, getDashboardStats, getExecutionEvents, getRecentRequests } from "@/lib/dashboardData";
import { checkBackendHealth, type HealthCheck } from "@/services/healthService";
import { approveAgentStep, rejectAgentStep, listAgentTasks } from "@/services/agentService";
import type { AgentTask } from "@/types/agent.types";

export function DashboardPage() {
  const {
    currentUser,
    executionResults,
    validationResults,
    diagnosisResults,
    workflowExecutionResult,
    manualRequestExecutions,
    collections,
    agentTasks,
    setAgentTasks,
    environments,
    activeEnvironmentId,
  } = useAppStore();

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) || environments[0];
  const activeVarsCount = (activeEnv?.variables || []).filter((v) => v.enabled).length;

  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [pendingApprovalTask, setPendingApprovalTask] = useState<AgentTask | null>(null);
  const [approving, setApproving] = useState(false);

  const refreshHealth = async () => {
    setHealthLoading(true);
    setHealth(await checkBackendHealth());
    setHealthLoading(false);
  };

  useEffect(() => {
    void refreshHealth();
    // Load active agent tasks to monitor approvals
    void listAgentTasks()
      .then((tasks) => {
        setAgentTasks(tasks);
        const waiting = tasks.find((t) => t.status === "WAITING_FOR_APPROVAL");
        setPendingApprovalTask(waiting ?? null);
      })
      .catch(() => {
        // Fallback gracefully if agent backend is offline
      });
  }, [setAgentTasks]);

  const events = getExecutionEvents(executionResults, workflowExecutionResult, manualRequestExecutions);
  const liveStats = getDashboardStats(executionResults, validationResults, diagnosisResults);
  const activity = getActivity(events);
  const recentRequests = getRecentRequests(events);

  const handleApproveStep = async (taskId: string, stepId: string) => {
    try {
      setApproving(true);
      const updated = await approveAgentStep(taskId, stepId);
      const remaining = agentTasks.map((t) => (t.taskId === taskId ? updated : t));
      setAgentTasks(remaining);
      const waiting = remaining.find((t) => t.status === "WAITING_FOR_APPROVAL");
      setPendingApprovalTask(waiting ?? null);
    } finally {
      setApproving(false);
    }
  };

  const handleRejectStep = async (taskId: string, stepId: string) => {
    try {
      setApproving(true);
      const updated = await rejectAgentStep(taskId, stepId, "Rejected from dashboard control center");
      const remaining = agentTasks.map((t) => (t.taskId === taskId ? updated : t));
      setAgentTasks(remaining);
      setPendingApprovalTask(null);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Clean & Focused Welcome Header with Active Environment ── */}
      <section className="panel-surface p-5 border border-slate-200/80">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Welcome back, {currentUser.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Real-time telemetry and test execution metrics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Inline Active Environment Badge */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-semibold text-slate-800">{activeEnv?.name || "Local"}</span>
              <span className="hidden sm:inline font-mono text-[11px] text-slate-400 max-w-[160px] truncate">
                {activeEnv?.baseUrl || "No base URL"}
              </span>
              <span className="rounded bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                {activeVarsCount}v
              </span>
              <Link
                to="/environments"
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline ml-0.5 text-xs"
              >
                Manage &rarr;
              </Link>
            </div>

            {events.length ? (
              <Link to="/reports" className={buttonVariants({ variant: "outline", size: "sm" })}>
                View Reports
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Persistence Auto-fallback Banner (Shown when MongoDB is not connected) ── */}
      {health?.database === "in-memory" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>Storage: In-Memory (Ephemeral)</strong> — Sessions and test history will reset on backend restart. Connect MongoDB in{" "}
              <code className="bg-amber-100/90 border border-amber-200 px-1.5 py-0.5 rounded text-[11px] font-mono">Backend/.env</code> for persistent cloud storage.
            </span>
          </div>
          <Link to="/settings" className="font-bold text-amber-800 hover:text-amber-950 hover:underline shrink-0 text-xs">
            Settings &rarr;
          </Link>
        </div>
      )}

      {/* ── 2. Live Workspace Metrics ── */}
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {liveStats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      {/* ── 3. Prominent Human-in-the-Loop Authorization Alert (Shown only when pending) ── */}
      {pendingApprovalTask && (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50/90 p-4.5 shadow-sm animate-in fade-in duration-200">
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                <ShieldAlert className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    Human Authorization Required
                  </span>
                  <span className="text-xs text-amber-700 font-medium font-mono">#{pendingApprovalTask.taskId.slice(-6)}</span>
                </div>
                <h4 className="mt-1 text-sm font-bold text-slate-900">
                  Step requires approval: {pendingApprovalTask.steps[pendingApprovalTask.currentStepIndex]?.tool || "Sensitive Network Execution"}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
                  {pendingApprovalTask.steps[pendingApprovalTask.currentStepIndex]?.summary ||
                    "An outbound HTTP network operation or code patch was proposed. Per security policy, human confirmation is required."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <Button
                variant="outline"
                size="sm"
                disabled={approving}
                onClick={() =>
                  handleRejectStep(
                    pendingApprovalTask.taskId,
                    pendingApprovalTask.steps[pendingApprovalTask.currentStepIndex]?.stepId
                  )
                }
                className="border-slate-300 text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 font-semibold text-xs"
              >
                Reject
              </Button>
              <Button
                size="sm"
                disabled={approving}
                onClick={() =>
                  handleApproveStep(
                    pendingApprovalTask.taskId,
                    pendingApprovalTask.steps[pendingApprovalTask.currentStepIndex]?.stepId
                  )
                }
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
              >
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Authorize &amp; Execute
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Telemetry: Activity Chart & Backend Health ── */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="panel-surface p-5 sm:p-6 lg:col-span-2">
          <SectionHeader
            title="API Activity"
            description="Recorded tests, workflows, and Request Builder requests in the last seven days."
          />
          <div className="mt-4">
            <ApiActivityChart data={activity} />
          </div>
        </div>

        <div className="panel-surface p-5 sm:p-6">
          <SectionHeader
            title="API Health"
            description="Explicit APIForge backend health check; ordinary API requests do not imply service health."
            action={
              <button
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                onClick={() => void refreshHealth()}
                disabled={healthLoading}
                aria-label="Refresh health"
              >
                {healthLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Check</span>
              </button>
            }
          />
          <div className="mt-4">
            {healthLoading ? (
              <p className="py-6 text-center text-xs text-slate-500 font-medium">Checking APIForge backend…</p>
            ) : (
              <>
                <HealthStatus
                  items={[
                    {
                      service: "APIForge backend",
                      status: health?.status ?? "Unknown",
                      responseTime: health?.responseTime ?? "—",
                    },
                  ]}
                />
                {health?.error ? (
                  <p className="mt-3 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                    {health.error}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 5. Live Records: Recent Requests & Collections ── */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="panel-surface p-5 sm:p-6 lg:col-span-2">
          <SectionHeader
            title="Recent Requests"
            description="Recorded tests, workflows, and Request Builder requests. URLs are redacted before display."
            action={
              <Link to="/history" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="mt-4">
            <RequestTable requests={recentRequests} />
          </div>
        </div>

        <div className="panel-surface p-5 sm:p-6">
          <SectionHeader
            title="Recent Collections"
            description="Recently updated API collections."
            action={
              <Link to="/collections" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Manage
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="mt-4 space-y-3">
            {collections.length ? (
              collections
                .slice()
                .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
                .slice(0, 4)
                .map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    name={collection.name}
                    requests={collection.requests.length}
                    updatedAt={new Date(collection.updatedAt).toLocaleString()}
                    accent="bg-sky-500/10 text-sky-700"
                    to={`/collections#${collection.id}`}
                  />
                ))
            ) : (
              <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 p-6 text-center">
                <p className="text-xs text-slate-400">No saved collections yet.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
