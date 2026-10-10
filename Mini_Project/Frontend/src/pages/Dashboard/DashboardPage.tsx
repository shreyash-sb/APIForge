import { ArrowRight, Download, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { AIAssistantCard } from "@/components/dashboard/AIAssistantCard";
import { ApiActivityChart } from "@/components/dashboard/ApiActivityChart";
import { CollectionCard } from "@/components/dashboard/CollectionCard";
import { HealthStatus } from "@/components/dashboard/HealthStatus";
import { QuickActionCard } from "@/components/dashboard/QuickActionCard";
import { RequestTable } from "@/components/dashboard/RequestTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { buttonVariants } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import {
  aiAssistantActions,
  apiActivity,
  apiHealth,
  collections,
  quickActions,
  recentRequests,
} from "@/data/mockData";

export function DashboardPage() {
  const reportSummary = useAppStore((state) => state.reportSummary);
  const generatedTests = useAppStore((state) => state.generatedTests);
  const liveStats = reportSummary ? [
    { title: "Current-run Tests", value: String(reportSummary.execution.totalTests), change: `${reportSummary.execution.executedTests} executed`, trend: "up" as const, tone: "primary" as const },
    { title: "Execution Pass", value: reportSummary.execution.passRate === null ? "—" : `${reportSummary.execution.passRate}%`, change: `${reportSummary.execution.failedExecution + reportSummary.execution.errors} execution issues`, trend: "up" as const, tone: "success" as const },
    { title: "Validation Failures", value: String(reportSummary.validation.validationFailed), change: `${reportSummary.validation.failedAssertions} failed assertions`, trend: "down" as const, tone: "warning" as const },
    { title: "AI Findings", value: String(reportSummary.diagnosis.totalFindings), change: `${reportSummary.diagnosis.diagnosedTests} tests diagnosed`, trend: "up" as const, tone: "ai" as const },
  ] : [];
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
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{reportSummary ? "Current-run metrics are live. Open the full report for endpoint and failure analysis." : generatedTests.length ? "Run and validate generated tests, then generate a current-run report." : "Import an OpenAPI specification and run tests to generate analytics."}</p>
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
            {reportSummary ? <Link to="/reports" className={buttonVariants({ variant: "outline", size: "lg" })}>View Full Report<ArrowRight className="h-4 w-4" /></Link> : null}
          </div>
        </div>
      </section>

      {liveStats.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{liveStats.map((stat) => <StatCard key={stat.title} {...stat} />)}</section> : <section className="panel-surface p-6"><p className="text-sm font-semibold text-slate-900">No current-run analytics yet</p><p className="mt-1 text-sm text-slate-500">Metrics appear here after you generate a report from the current test run.</p>{generatedTests.length ? <Link to="/reports" className={buttonVariants({ variant: "outline", className: "mt-4" })}>Generate Report<ArrowRight className="h-4 w-4" /></Link> : <Link to="/openapi" className={buttonVariants({ variant: "outline", className: "mt-4" })}>Import OpenAPI<Download className="h-4 w-4" /></Link>}</section>}

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
            description="Requests and errors across the last seven days."
          />
          <div className="mt-6">
            <ApiActivityChart data={apiActivity} />
          </div>
        </div>

        <div className="panel-surface p-6">
          <SectionHeader
            title="API Health"
            description="Current service stability and response behavior."
          />
          <div className="mt-6">
            <HealthStatus items={apiHealth} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <div className="panel-surface p-6">
          <SectionHeader
            title="Recent Requests"
            description="Track recent request activity across your workspace."
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
              {collections.map((collection) => (
                <CollectionCard key={collection.name} {...collection} />
              ))}
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
