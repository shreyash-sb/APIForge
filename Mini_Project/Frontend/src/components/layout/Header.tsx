import { Bell, Menu, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAppStore } from "@/store/useAppStore";

export function Header() {
  const { title, description } = usePageTitle();
  const { currentUser, toggleSidebar, resetWorkspace } = useAppStore();

  const handleResetWorkspace = () => {
    if (
      window.confirm(
        "Are you sure you want to reset the workspace? This will clear all loaded OpenAPI specifications, generated test cases, and execution results, restoring initial workspace defaults."
      )
    ) {
      resetWorkspace();
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-background/90 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" className="lg:hidden" onClick={toggleSidebar} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </div>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search requests, collections, endpoints" className="pl-9" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetWorkspace}
              className="gap-1.5 text-xs text-slate-600 hover:text-rose-600 hover:border-rose-300"
              title="Reset Workspace"
              id="reset-workspace-button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Workspace
            </Button>
            <Button variant="outline" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {currentUser.name.slice(0, 1)}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-950">{currentUser.name}</p>
                <p className="text-xs text-slate-500">{currentUser.role}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 md:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search workspace" className="pl-9" />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleResetWorkspace}
            aria-label="Reset Workspace"
            title="Reset Workspace"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
