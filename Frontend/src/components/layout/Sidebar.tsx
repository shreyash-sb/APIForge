import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Search,
  Terminal,
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
          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors duration-100",
          isActive
            ? "bg-black/[0.07] font-medium text-slate-900"
            : "text-slate-700 hover:bg-black/[0.04]",
          isCollapsed && "justify-center px-2"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              "text-blue-600"
            )}
          />
          {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
          {!isCollapsed && badge ? (
            <span
              className={cn(
                "rounded-[5px] px-1.5 py-px text-[11px] font-medium",
                isActive
                  ? "bg-black/[0.07] text-slate-600"
                  : "bg-black/[0.05] text-slate-500"
              )}
            >
              {badge}
            </span>
          ) : null}

          {/* Collapsed Tooltip */}
          {isCollapsed && (
            <div className="pointer-events-none absolute left-full ml-2.5 hidden -translate-y-1/2 rounded-md bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white shadow-panel whitespace-nowrap group-hover:block z-50">
              {label}
              {badge && <span className="ml-1 text-[11px] text-slate-300">({badge})</span>}
            </div>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen, currentUser } = useAppStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState("");

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const handleSignOut = () => setConfirmSignOut(true);
  const confirmAndSignOut = async () => {
    setConfirmSignOut(false);
    await logout();
    navigate("/login");
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
        "flex h-screen max-h-screen flex-col border-r border-black/[0.08] bg-[#F5F5F7]/90 px-2.5 py-3.5 text-slate-900 backdrop-blur-xl transition-[width] duration-200 overscroll-contain select-none",
        isCollapsed ? "w-[72px]" : "w-[264px]"
      )}
    >
      {/* Brand Header */}
      {isCollapsed ? (
        <div className="flex flex-col items-center gap-2.5 px-0.5">
          <NavLink
            to="/dashboard"
            className="flex items-center justify-center"
            title="APIForge Dashboard"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-blue-600 text-white">
              <Terminal className="h-4 w-4" />
            </div>
          </NavLink>

          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="rounded-md p-1 text-slate-500 hover:bg-black/[0.05] hover:text-slate-900 transition-colors"
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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-blue-600 text-white">
              <Terminal className="h-4 w-4" />
            </div>
            <span className="text-[15px] font-semibold text-slate-900">APIForge</span>
          </NavLink>

          <div className="flex items-center gap-1">
            {/* Desktop collapse toggle */}
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="hidden rounded-md p-1.5 text-slate-500 hover:bg-black/[0.05] hover:text-slate-900 lg:flex"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Mobile close button */}
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-500 hover:bg-black/[0.05] hover:text-slate-900 lg:hidden"
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter tools..."
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            className="w-full rounded-lg border border-transparent bg-black/[0.05] py-1.5 pl-8 pr-7 text-[13px] text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-500/25"
          />
          {navSearch && (
            <button
              onClick={() => setNavSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 text-xs"
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
          isCollapsed ? "scrollbar-none px-0" : "px-0.5 pr-1"
        )}
      >
        {filteredGroups.map((group) => (
          <div key={group.title}>
            {!isCollapsed ? (
              <p className="px-2.5 text-[11px] font-semibold text-slate-500">
                {group.title}
              </p>
            ) : (
              <div className="my-2 border-t border-black/[0.08]" />
            )}
            <div className="mt-1 space-y-px">
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
      <div className="mt-auto border-t border-black/[0.08] pt-2.5">
        <div className="space-y-px">
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
              "mt-2 rounded-lg p-1.5",
              isCollapsed ? "flex flex-col items-center justify-center p-1.5" : "flex items-center justify-between gap-2.5"
            )}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-400 text-xs font-semibold text-white">
                {(currentUser.name || user.name).slice(0, 1).toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-[#F5F5F7] bg-emerald-500" />
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden">
                  <p className="truncate text-[13px] font-medium text-slate-900 leading-tight">{currentUser.name || user.name}</p>
                  <p className="truncate text-[11px] text-slate-500 capitalize leading-tight">{user.role || "API Engineer"}</p>
                </div>
              )}
            </div>

            {!isCollapsed ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md p-1.5 text-slate-500 hover:bg-black/[0.05] hover:text-rose-500 transition-colors"
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
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-blue-600 hover:bg-black/[0.04] transition-colors",
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
            className="absolute inset-0 bg-black/25"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation overlay"
          />
          <div className="relative h-full w-[85%] max-w-[280px]">{navBody}</div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of APIForge?"
        message="You will need to sign in again. Any Gemini API key saved for this session is cleared."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => void confirmAndSignOut()}
      />
    </>
  );
}
