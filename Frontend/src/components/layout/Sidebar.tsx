import {
  Activity,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Shield,
  Sparkles,
  Terminal,
  User,
  X,
} from "lucide-react";
import { useState, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { navigationGroups, secondaryNavigation } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";

function NavItemLink({
  label,
  path,
  icon: Icon,
  badge,
  isCollapsed,
  onClick,
}: {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isCollapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={path}
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25"
            : "text-slate-400 hover:bg-slate-800/70 hover:text-white",
          isCollapsed && "justify-center px-2"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-4.5 w-4.5 shrink-0 transition-transform duration-150 group-hover:scale-105",
              isActive ? "text-white" : "text-slate-400 group-hover:text-white"
            )}
          />
          {!isCollapsed && <span className="flex-1 truncate font-medium text-sm">{label}</span>}
          {!isCollapsed && badge ? (
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              )}
            >
              {badge}
            </span>
          ) : null}

          {/* Collapsed Tooltip */}
          {isCollapsed && (
            <div className="pointer-events-none absolute left-full ml-2.5 hidden -translate-y-1/2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xl border border-slate-700 whitespace-nowrap group-hover:block z-50">
              {label}
              {badge && <span className="ml-1 text-[11px] text-indigo-400">({badge})</span>}
            </div>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState("");

  const handleSignOut = async () => {
    if (window.confirm("Are you sure you want to log out of APIForge?")) {
      await logout();
      navigate("/login");
    }
  };

  // Filter navigation items by search keyword
  const filteredGroups = useMemo(() => {
    if (!navSearch.trim()) return navigationGroups;
    const q = navSearch.toLowerCase().trim();
    return navigationGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) => item.label.toLowerCase().includes(q) || (item.badge && item.badge.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [navSearch]);

  const navBody = (
    <div
      className={cn(
        "flex h-screen max-h-screen flex-col border-r border-slate-800/80 bg-slate-950 px-3 py-3.5 text-slate-200 transition-all duration-200 overscroll-contain select-none",
        isCollapsed ? "w-[72px]" : "w-[264px]"
      )}
    >
      {/* Brand Header */}
      {isCollapsed ? (
        <div className="flex flex-col items-center gap-2.5 px-0.5">
          <NavLink
            to="/dashboard"
            className="flex items-center justify-center transition-transform hover:scale-105"
            title="APIForge Dashboard"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30">
              <Terminal className="h-4.5 w-4.5" />
            </div>
          </NavLink>

          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-1">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-3 overflow-hidden text-left"
            title="APIForge Dashboard"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30">
              <Terminal className="h-4.5 w-4.5" />
            </div>
            <span className="text-base font-bold tracking-tight text-white">APIForge</span>
          </NavLink>

          <div className="flex items-center gap-1">
            {/* Desktop collapse toggle */}
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/80 hover:text-white lg:flex"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Mobile close button */}
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Quick Search in sidebar (expanded only) */}
      {!isCollapsed && (
        <div className="relative mt-3 px-0.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter tools..."
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-1.5 pl-8 pr-7 text-xs text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
          />
          {navSearch && (
            <button
              onClick={() => setNavSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
            >
              &times;
            </button>
          )}
        </div>
      )}

      {/* Navigation Links Scroll Container - Scroll isolated with overscroll-contain */}
      <div
        className={cn(
          "mt-3 flex-1 space-y-4 overflow-y-auto overscroll-contain",
          isCollapsed ? "scrollbar-none px-0" : "px-0.5 pr-1.5 scrollbar-thin scrollbar-thumb-slate-800"
        )}
      >
        {filteredGroups.map((group) => (
          <div key={group.title}>
            {!isCollapsed ? (
              <p className="px-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {group.title}
              </p>
            ) : (
              <div className="my-2 border-t border-slate-800/60" />
            )}
            <div className="mt-1.5 space-y-1">
              {group.items.map((item) => (
                <NavItemLink
                  key={item.path}
                  {...item}
                  isCollapsed={isCollapsed}
                  onClick={() => setSidebarOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredGroups.length === 0 && !isCollapsed && (
          <p className="px-2 py-3 text-center text-xs text-slate-400">
            No matching tools for &ldquo;{navSearch}&rdquo;
          </p>
        )}
      </div>

      {/* Bottom Area: Settings & User Profile Card */}
      <div className="mt-auto border-t border-slate-800/80 pt-2.5">
        <div className="space-y-1">
          {secondaryNavigation.map((item) => (
            <NavItemLink
              key={item.path}
              {...item}
              isCollapsed={isCollapsed}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </div>

        {/* User Card */}
        {isAuthenticated && user ? (
          <div
            className={cn(
              "mt-2.5 rounded-xl border border-slate-800/80 bg-slate-900/80 p-2 transition-all",
              isCollapsed ? "flex flex-col items-center justify-center p-1.5" : "flex items-center justify-between gap-2.5"
            )}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
                {user.name.slice(0, 1).toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-950 bg-emerald-400" />
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden">
                  <p className="truncate text-sm font-semibold text-white leading-tight">{user.name}</p>
                  <p className="truncate text-xs text-slate-400 capitalize leading-tight">{user.role || "API Engineer"}</p>
                </div>
              )}
            </div>

            {!isCollapsed ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-2.5">
            <NavLink
              to="/login"
              className={cn(
                "flex items-center gap-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 transition-all",
                isCollapsed && "justify-center px-2"
              )}
              title="Sign In"
            >
              <LogIn className="h-4 w-4" />
              {!isCollapsed && <span>Sign In</span>}
            </NavLink>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 h-screen shrink-0 hidden lg:block overflow-hidden z-20">
        {navBody}
      </aside>
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation overlay"
          />
          <div className="relative h-full w-[85%] max-w-[280px]">{navBody}</div>
        </div>
      ) : null}
    </>
  );
}
