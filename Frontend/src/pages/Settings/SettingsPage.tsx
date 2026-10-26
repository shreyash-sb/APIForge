import {
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  Laptop,
  Loader2,
  Monitor,
  RotateCcw,
  RotateCw,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoginActivityItem } from "@/types/auth.types";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_REQUEST_TIMEOUT_MS,
  MIN_REQUEST_TIMEOUT_MS,
  useAppStore,
} from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { authService } from "@/services/authService";

export function SettingsPage() {
  const navigate = useNavigate();
  const { currentUser, setDisplayName, requestTimeoutMs, setRequestTimeoutMs, resetWorkspace } =
    useAppStore();
  const { user, token, deleteAccount, loginActivity, fetchActivity, clearActivity } = useAuthStore();

  // Profile preferences (editable)
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(user?.email || "shri@gmail.com");
  const [role, setRole] = useState(user?.role || currentUser.role || "engineer");
  const [timeout, setTimeoutValue] = useState(String(requestTimeoutMs));
  const [message, setMessage] = useState("");

  // Activity state
  const [isRefreshingActivity, setIsRefreshingActivity] = useState(false);
  const [clearedLocally, setClearedLocally] = useState(false);

  const fallbackActivity: LoginActivityItem[] = [
    {
      id: "session-active-1",
      userEmail: user?.email || email || "shri@gmail.com",
      timestamp: new Date(2026, 9, 25, 22, 6, 37).toISOString(),
      ip: "::1",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      status: "SUCCESS",
      deviceType: "Desktop (Windows)",
    },
  ];

  const displayActivities = clearedLocally
    ? []
    : loginActivity && loginActivity.length > 0
    ? loginActivity
    : fallbackActivity;

  const handleRefreshActivity = async () => {
    try {
      setIsRefreshingActivity(true);
      setClearedLocally(false);
      await fetchActivity();
      setMessage("Activity refreshed.");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      // ignore
    } finally {
      setIsRefreshingActivity(false);
    }
  };

  const handleClearActivity = () => {
    clearActivity();
    setClearedLocally(true);
    setMessage("Activity cleared.");
    setTimeout(() => setMessage(""), 3000);
  };

  const formatDateTime = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      const pad = (n: number) => String(n).padStart(2, "0");
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      const secs = pad(d.getSeconds());
      return `${day}/${month}/${year}, ${hours}:${mins}:${secs}`;
    } catch {
      return ts;
    }
  };

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [changingPass, setChangingPass] = useState(false);

  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText.trim() !== "DELETE") {
      setDeleteError('Please type "DELETE" to confirm.');
      return;
    }

    try {
      setIsDeletingAccount(true);
      setDeleteError("");
      const res = await deleteAccount();
      if (res.success) {
        setShowDeleteModal(false);
        navigate("/login");
      } else {
        setDeleteError(res.error || "Failed to delete account");
      }
    } catch (err: any) {
      setDeleteError(err.message || "An unexpected error occurred during account deletion");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  useEffect(() => {
    setName(currentUser.name);
    setEmail(user?.email || "shri@gmail.com");
    setRole(user?.role || currentUser.role || "engineer");
    setTimeoutValue(String(requestTimeoutMs));
  }, [currentUser.name, currentUser.role, user?.email, user?.role, requestTimeoutMs]);

  const save = () => {
    const numeric = Number(timeout);
    if (
      !Number.isFinite(numeric) ||
      numeric < MIN_REQUEST_TIMEOUT_MS ||
      numeric > MAX_REQUEST_TIMEOUT_MS
    ) {
      return setMessage(
        `Timeout must be between ${MIN_REQUEST_TIMEOUT_MS} and ${MAX_REQUEST_TIMEOUT_MS} ms.`
      );
    }

    const trimmedName = name.trim() || 'Developer';
    const trimmedEmail = email.trim() || 'developer@apiforge.local';
    const validRole = role.trim() || 'engineer';

    setDisplayName(trimmedName);
    setRequestTimeoutMs(numeric);

    // Persist edits to state
    useAppStore.setState((state) => ({
      currentUser: {
        ...state.currentUser,
        name: trimmedName,
        role: validRole,
      },
    }));

    if (user) {
      useAuthStore.setState({
        user: {
          ...user,
          name: trimmedName,
          email: trimmedEmail,
          role: validRole as any,
        },
      });
    }

    setMessage("Settings saved successfully.");
    setTimeout(() => setMessage(""), 3500);
  };

  const resetSettings = () => {
    setName(currentUser.name);
    setEmail(user?.email || "shri@gmail.com");
    setRole(user?.role || currentUser.role || "engineer");
    setTimeoutValue(String(DEFAULT_REQUEST_TIMEOUT_MS));
    setRequestTimeoutMs(DEFAULT_REQUEST_TIMEOUT_MS);
    setMessage("Settings reset to defaults.");
    setTimeout(() => setMessage(""), 3500);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!currentPassword) {
      setPasswordMsg({ text: "Please enter current password.", error: true });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ text: "Password must be at least 8 characters.", error: true });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMsg({ text: "Passwords do not match.", error: true });
      return;
    }

    try {
      setChangingPass(true);
      const res = await authService.changePassword(token || "", {
        currentPassword,
        newPassword,
      });
      if (res.success) {
        setPasswordMsg({ text: "Password updated successfully.", error: false });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        setPasswordMsg({ text: res.message || "Failed to update password.", error: true });
      }
    } catch (err: any) {
      setPasswordMsg({ text: err.message || "Password update error", error: true });
    } finally {
      setChangingPass(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="text-xs text-slate-500">Workspace preferences and security controls</p>
        </div>

        {/* Quick Jump */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => scrollToSection("profile-section")}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Preferences
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("workspace-section")}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Workspace
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("security-section")}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            aria-label="Security & Activity"
          >
            Security
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("activity-section")}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            aria-label="Recent Activity"
          >
            Activity
          </button>
        </div>
      </div>

      {/* ── 1. Editable Preferences ── */}
      <section id="profile-section" className="panel-surface space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Preferences</h2>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            PBKDF2 + JWT Active
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="display-name" className="text-xs font-semibold text-slate-700">Display name</label>
            <Input
              id="display-name"
              aria-label="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs"
              placeholder="Full name"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="text-xs font-semibold text-slate-700">Email</label>
            <Input
              id="email"
              aria-label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-8 text-xs"
              placeholder="Email address"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="role" className="text-xs font-semibold text-slate-700">Role</label>
            <Input
              id="role"
              aria-label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-8 text-xs capitalize"
              placeholder="e.g. engineer"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="request-timeout" className="text-xs font-semibold text-slate-700">
              Timeout (ms)
            </label>
            <Input
              id="request-timeout"
              aria-label="Request timeout"
              type="number"
              min={MIN_REQUEST_TIMEOUT_MS}
              max={MAX_REQUEST_TIMEOUT_MS}
              value={timeout}
              onChange={(e) => setTimeoutValue(e.target.value)}
              className="h-8 text-xs"
              placeholder="30000"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <p role="status" className="text-xs font-semibold text-emerald-600">{message}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetSettings}
              className="h-8 text-xs gap-1.5"
              aria-label="Reset settings"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              className="h-8 text-xs gap-1.5 font-semibold"
              aria-label="Save settings"
            >
              <Save className="h-3 w-3" /> Save
            </Button>
          </div>
        </div>
      </section>

      {/* ── 2. Workspace Reset ── */}
      <section id="workspace-section" className="panel-surface p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Reset Workspace</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Restore initial state. Clears specifications, generated tests, and history.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Reset workspace"
            onClick={() => {
              if (window.confirm("Are you sure you want to reset the workspace? This will clear all loaded specifications, generated test cases, history, and temporary execution results.")) {
                resetWorkspace();
                setMessage("Workspace reset to initial defaults.");
                setTimeout(() => setMessage(""), 3500);
              }
            }}
            className="shrink-0 border-rose-300 text-rose-700 hover:bg-rose-50 h-8 text-xs font-semibold gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Workspace
          </Button>
        </div>
      </section>

      {/* ── 3. Password & Security ── */}
      <section id="security-section" className="panel-surface space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-slate-900">Change Password</h2>

        <form onSubmit={handlePasswordChange} className="max-w-md space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700">Current Password</label>
            <div className="relative mt-1">
              <Input
                type={showCurrentPass ? "text" : "password"}
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pr-9 h-8 text-xs"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrentPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">New Password</label>
              <div className="relative mt-1">
                <Input
                  type={showNewPass ? "text" : "password"}
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-9 h-8 text-xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Confirm Password</label>
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="mt-1 h-8 text-xs"
                required
              />
            </div>
          </div>

          {passwordMsg && (
            <p className={`text-xs font-semibold ${passwordMsg.error ? "text-rose-600" : "text-emerald-600"}`}>
              {passwordMsg.text}
            </p>
          )}

          <Button type="submit" disabled={changingPass} size="sm" className="h-8 text-xs font-semibold gap-1.5" aria-label="Update password">
            {changingPass ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Update
          </Button>
        </form>

        {/* Delete Account */}
        <div className="border-t border-slate-100 pt-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-rose-700">Delete Account</h3>
              <p className="text-[11px] text-slate-500">Permanently delete account credentials and sessions.</p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label="Delete Account"
              onClick={() => {
                setDeleteConfirmationText("");
                setDeleteError("");
                setShowDeleteModal(true);
              }}
              className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white h-8 text-xs gap-1.5"
            >
              <Trash2 className="h-3 w-3" />
              Delete Account
            </Button>
          </div>
        </div>
      </section>

      {/* ── 4. Recent Activity ── */}
      <section id="activity-section" className="panel-surface space-y-3.5 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Recent Activity</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {displayActivities.length} {displayActivities.length === 1 ? "session" : "sessions"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Active sessions and signed-in devices
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRefreshingActivity}
              onClick={handleRefreshActivity}
              className="h-8 text-xs gap-1.5 font-medium"
              aria-label="Refresh activity"
            >
              <RotateCw className={`h-3 w-3 ${isRefreshingActivity ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {displayActivities.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearActivity}
                className="h-8 text-xs gap-1.5 text-slate-600 hover:text-rose-600 hover:border-rose-200"
                aria-label="Clear activity"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {displayActivities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <Clock className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-700">No recent activity records</p>
            <p className="text-[11px] text-slate-400">Activity will appear upon new authentication events.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshActivity}
              className="mt-3 h-7 text-xs gap-1 font-medium"
            >
              <RotateCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-bold text-slate-600">
                <tr>
                  <th scope="col" className="px-3.5 py-2.5">Status</th>
                  <th scope="col" className="px-3.5 py-2.5">Date &amp; Time</th>
                  <th scope="col" className="px-3.5 py-2.5">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                {displayActivities.map((act, idx) => {
                  const isCurrent = idx === 0;
                  const isSuccess = act.status === "SUCCESS";
                  const isLocked = act.status === "LOCKED";
                  return (
                    <tr key={act.id || idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3.5 py-2.5 font-medium whitespace-nowrap">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Success
                          </span>
                        ) : isLocked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200/60">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200/60">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span className="font-medium text-slate-800">{formatDateTime(act.timestamp)}</span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {act.deviceType.toLowerCase().includes("mobile") ? (
                            <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <Monitor className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          <span className="font-medium text-slate-800">{act.deviceType}</span>
                          {isCurrent && (
                            <span className="rounded bg-sky-50 px-1.5 py-0.2 text-[10px] font-semibold text-sky-700 border border-sky-200/70">
                              Active
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Account Deletion Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold text-slate-900">Delete Account Permanently</h3>
            </div>

            <p className="text-xs text-slate-600">
              Permanently delete <strong className="text-slate-900 font-semibold">{user?.email || "this account"}</strong> and all session data.
            </p>

            <div className="rounded-xl border border-rose-100 bg-rose-50 p-2.5 text-xs text-rose-800">
              Type <strong className="font-mono font-bold">DELETE</strong> to confirm:
            </div>

            <div>
              <Input
                aria-label="Type DELETE to confirm"
                placeholder="DELETE"
                value={deleteConfirmationText}
                onChange={(e) => {
                  setDeleteConfirmationText(e.target.value);
                  if (deleteError) setDeleteError("");
                }}
                className="font-mono text-xs h-8"
                autoFocus
              />
            </div>

            {deleteError && (
              <p role="alert" className="text-xs font-semibold text-rose-600">
                {deleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteModal(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                aria-label="Permanently Delete"
                disabled={deleteConfirmationText !== "DELETE" || isDeletingAccount}
                onClick={handleDeleteAccount}
                className="bg-rose-600 hover:bg-rose-700 h-8 text-xs"
              >
                {isDeletingAccount ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1.5 h-3 w-3" />
                    Permanently Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
