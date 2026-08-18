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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  aiAssistantActions,
  apiActivity,
  apiHealth,
  collections,
  dashboardStats,
  quickActions,
  recentRequests,
} from "@/data/mockData";

export function DashboardPage() {
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
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
              Monitor your APIs, requests and development activity from one place.
            </p>
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
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

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
