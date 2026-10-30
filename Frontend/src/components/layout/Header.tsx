import {
  Activity,
  Bell,
  CheckCheck,
  Globe,
  Menu,
  Shield,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

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
  const {
    toggleSidebar,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearNotifications,
  } = useAppStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notifications menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* ── Left: Navigation Trigger + Short Impactful Title ── */}
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl border-slate-200 lg:hidden"
            onClick={toggleSidebar}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h1 className="truncate text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
        </div>

        {/* ── Right: Clean, focused controls ── */}
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Notifications Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 transition-all hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[340px] sm:w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50">
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bell className="h-4 w-4 shrink-0 text-slate-700" />
                    <span className="text-sm font-bold text-slate-900 truncate">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
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
                                <span className="text-[10px] text-slate-400">
                                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {n.actionLabel && (
                                  <span className="text-[10px] font-semibold text-blue-600 hover:underline">
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
                    <p className="text-center text-[10px] text-slate-400">Click to open · Hover to dismiss</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
