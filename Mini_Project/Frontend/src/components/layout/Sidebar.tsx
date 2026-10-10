import { X } from "lucide-react";
import { NavLink } from "react-router-dom";

import { secondaryNavigation } from "@/data/mockData";
import { navigationGroups } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

function NavItemLink({
  label,
  path,
  icon: Icon,
  badge,
  onClick,
}: {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={path}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-slate-900 text-white shadow-soft"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("h-4.5 w-4.5", isActive ? "text-white" : "text-slate-500 group-hover:text-slate-900")} />
          <span className="flex-1">{label}</span>
          {badge ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                isActive ? "bg-white/15 text-white" : "bg-violet-100 text-violet-700",
              )}
            >
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();

  const navBody = (
    <div className="flex h-full flex-col rounded-r-3xl border-r border-slate-200 bg-white/95 px-4 py-5 shadow-soft lg:rounded-none lg:shadow-none">
      <div className="flex items-start justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-slate-950 p-2.5 text-white shadow-soft">
            <span className="block text-sm font-bold tracking-[0.2em]">AF</span>
          </div>
          <div>
            <p className="text-base font-semibold text-slate-950">APIForge</p>
            <p className="text-xs text-slate-500">API Development Platform</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-8 flex-1 space-y-6 overflow-y-auto pr-1">
        {navigationGroups.map((group) => (
          <div key={group.title}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{group.title}</p>
            <div className="mt-3 space-y-1">
              {group.items.map((item) => (
                <NavItemLink key={item.path} {...item} onClick={() => setSidebarOpen(false)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-4">
        <div className="space-y-1">
          {secondaryNavigation.map((item) => (
            <NavItemLink key={item.path} {...item} onClick={() => setSidebarOpen(false)} />
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-950">Developer</p>
          <p className="text-xs text-slate-500">API Engineer</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[252px] shrink-0 lg:block">{navBody}</aside>
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation overlay"
          />
          <div className="relative h-full w-[88%] max-w-[320px]">{navBody}</div>
        </div>
      ) : null}
    </>
  );
}
