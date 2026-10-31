import {
  Activity,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  Globe,
  Menu,
  Shield,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAppStore } from "@/store/useAppStore";

import type { NotificationType } from "@/types/notification.types";

const NOTIF_COLORS: Record<NotificationType, { bg: string; border: string; iconCls: string; dot: string }> = {
  success: { bg: "bg-emerald-50/70", border: "border-emerald-100", iconCls: "text-emerald-500", dot: "bg-emerald-500" },
  info:    { bg: "bg-blue-50/60",    border: "border-blue-100",    iconCls: "text-blue-500",    dot: "bg-blue-500" },
  warning: { bg: "bg-amber-50/60",   border: "border-amber-100",   iconCls: "text-amber-500",   dot: "bg-amber-500" },
  error:   { bg: "bg-rose-50/60",    border: "border-rose-100",    iconCls: "text-rose-500",    dot: "bg-rose-500" },
};

function NotifIcon({ type }: { type: NotificationType }) {
  const cls = `h-4 w-4 ${NOTIF_COLORS[type]?.iconCls ?? 'text-blue-500'} shrink-0 mt-0.5`;
  if (type === "success") return <Shield className={cls} />;
  if (type === "warning") return <Activity className={cls} />;
  if (type === "error") return <Activity className={cls} />;
  return <Globe className={cls} />;
}

export function Header() {
  const navigate = useNavigate();
  const { title } = usePageTitle();
  // The page name lives in the browser tab title rather than repeating the in-page heading.
  useEffect(() => {
    document.title = title && title !== "APIForge" ? `${title} · APIForge` : "APIForge";
  }, [title]);
  const {
    toggleSidebar,
    environments,
    activeEnvironmentId,
    setActiveEnvironmentId,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearNotifications,
  } = useAppStore();

  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const envMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (envMenuRef.current && !envMenuRef.current.contains(event.target as Node)) {
        setEnvMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) || environments[0];
  const activeVarsCount = (activeEnv?.variables || []).filter((v) => v.enabled).length;

  return (
    <header className="sticky top-0 z-20 border-b border-black/[0.08] bg-white/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* ── Left: navigation trigger (mobile). Pages show their own heading in content. ── */}
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 lg:hidden"
            onClick={toggleSidebar}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Right: Desktop controls with clean alignment ── */}
        <div className="hidden shrink-0 items-center gap-2.5 md:flex">

          {/* Environment Switcher */}
          <div className="relative" ref={envMenuRef}>
            <button
              type="button"
              onClick={() => setEnvMenuOpen(!envMenuOpen)}
              className="flex h-8 items-center gap-2 rounded-lg border border-black/[0.1] bg-white px-2.5 text-[13px] font-medium text-slate-800 shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
              title={`Active Environment: ${activeEnv?.name || "Local"} (${activeVarsCount} active variables)`}
            >
              <Globe className="h-4 w-4 shrink-0 text-blue-500" />
              <span className="max-w-[70px] sm:max-w-[95px] lg:max-w-[130px] truncate">{activeEnv?.name || "Local"}</span>
              <span className="hidden xl:inline-flex items-center px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                {activeVarsCount} vars
              </span>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
            {envMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-sheet animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-blue-600" />
                    Environments
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {environments.length} available
                  </span>
                </div>
                <div className="py-1.5 space-y-1">
                  {environments.map((env) => {
                    const count = (env.variables || []).filter((v) => v.enabled).length;
                    const isActive = env.id === activeEnvironmentId;
                    const displayUrl = env.baseUrl ? env.baseUrl.replace(/^https?:\/\//, '') : 'No URL';
                    return (
                      <button
                        key={env.id}
                        type="button"
                        onClick={() => { setActiveEnvironmentId(env.id); setEnvMenuOpen(false); }}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                          isActive
                            ? "bg-blue-50/80 font-semibold text-blue-900 border border-blue-200/60"
                            : "text-slate-700 hover:bg-slate-50 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isActive ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-slate-300"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-xs text-slate-900">{env.name}</span>
                              <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-100 font-mono text-slate-500 font-normal">
                                {count}v
                              </span>
                            </div>
                            <span className="block truncate font-mono text-[11px] text-slate-400">
                              {displayUrl}
                            </span>
                          </div>
                        </div>
                        {isActive && <Check className="ml-2 h-4 w-4 shrink-0 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-slate-100 pt-1.5">
                  <Link
                    to="/environments"
                    onClick={() => setEnvMenuOpen(false)}
                    className="flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    Manage Environments →
                  </Link>
                </div>
              </div>
            )}
          </div>



          {/* Notifications Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/[0.1] bg-white text-slate-600 shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[340px] sm:w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sheet">
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bell className="h-4 w-4 shrink-0 text-slate-700" />
                    <span className="text-sm font-bold text-slate-900 truncate">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllNotificationsRead()}
                        className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                        title="Mark all as read"
                      >
                        <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                        <span>Mark read</span>
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        type="button"
                        onClick={() => clearNotifications()}
                        className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600"
                        title="Clear all"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Notification list */}
                <div className="max-h-[340px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                      <Zap className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-semibold">All caught up!</p>
                      <p className="text-xs">No notifications to show.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 p-2">
                      {notifications.map((n) => {
                        const c = NOTIF_COLORS[n.type] ?? NOTIF_COLORS.info;
                        return (
                          <div
                            key={n.id}
                            onClick={() => {
                              markNotificationRead(n.id);
                              if (n.actionUrl) {
                                navigate(n.actionUrl);
                                setNotifOpen(false);
                              }
                            }}
                            className={`group relative flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all hover:bg-slate-50/80 ${c.bg} ${c.border} ${n.read ? "opacity-60" : ""}`}
                          >
                            <NotifIcon type={n.type} />
                            <div className="min-w-0 flex-1 pr-4">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs leading-snug text-slate-900 truncate ${n.read ? "font-medium" : "font-bold"}`}>{n.title}</p>
                                {!n.read && <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />}
                              </div>
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{n.message}</p>
                              <div className="mt-1.5 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-slate-400">
                                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {n.actionLabel && (
                                  <span className="text-[11px] font-semibold text-blue-600 hover:underline">
                                    {n.actionLabel} →
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                              className="absolute right-2 top-2 hidden rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 group-hover:flex"
                              title="Dismiss"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
                    <p className="text-center text-[11px] text-slate-400">Click to open · Hover to dismiss</p>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Mobile controls ── */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="h-3.5 w-3.5" />
            {unreadCount > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-600" />}
          </button>
        </div>

      </div>

    </header>
  );
}

