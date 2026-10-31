import { Check, Eye, EyeOff, Lock, Mail, ShieldAlert, Terminal, User, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/useAuthStore";

export function SignUpPage() {
  const navigate = useNavigate();
  const { signup, isLoading, error, clearError } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const passwordChecks = useMemo(() => {
    return {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      symbol: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    };
  }, [password]);

  const strengthScore = useMemo(() => {
    let score = 0;
    if (passwordChecks.length) score += 20;
    if (passwordChecks.upper) score += 20;
    if (passwordChecks.lower) score += 20;
    if (passwordChecks.number) score += 20;
    if (passwordChecks.symbol) score += 20;
    return score;
  }, [passwordChecks]);

  const strengthLabel = useMemo(() => {
    if (strengthScore <= 20) return { text: "Very Weak", color: "text-rose-500", bar: "bg-rose-500" };
    if (strengthScore <= 40) return { text: "Weak", color: "text-amber-400", bar: "bg-amber-500" };
    if (strengthScore <= 60) return { text: "Moderate", color: "text-yellow-400", bar: "bg-yellow-500" };
    if (strengthScore <= 80) return { text: "Good", color: "text-sky-400", bar: "bg-sky-500" };
    return { text: "Strong", color: "text-emerald-400", bar: "bg-emerald-500" };
  }, [strengthScore]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    if (!name.trim()) {
      setLocalError("Full name is required.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError("Please enter a valid email address.");
      return;
    }
    if (strengthScore < 100) {
      setLocalError("Password does not meet all security requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }

    const res = await signup(name.trim(), email.trim(), password);
    if (res.success) {
      navigate("/dashboard");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F5F5F7] px-4 py-12 sm:px-6 lg:px-8">

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center rounded-[14px] bg-blue-600 p-3">
            <Terminal className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-[28px] font-semibold text-slate-900">Create Account</h1>
          <p className="mt-2 text-sm text-slate-500">
            Join APIForge to build, test, and validate APIs securely
          </p>
        </div>

        {/* Card */}
        <div className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-8 shadow-panel">
          {(error || localError) && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span>{error || localError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-slate-700">
                Full Name
              </label>
              <div className="relative mt-2">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-700">
                Email address
              </label>
              <div className="relative mt-2">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[13px] font-medium text-slate-700">
                  Password
                </label>
                {password && (
                  <span className={`text-xs font-semibold ${strengthLabel.color}`}>
                    Strength: {strengthLabel.text}
                  </span>
                )}
              </div>
              <div className="relative mt-2">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength Meter Bar */}
              {password && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all duration-300 ${strengthLabel.bar}`}
                      style={{ width: `${strengthScore}%` }}
                    />
                  </div>

                  {/* Checklist */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      {passwordChecks.length ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-slate-600" />
                      )}
                      <span className={passwordChecks.length ? "text-slate-800" : ""}>8+ characters</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {passwordChecks.upper ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-slate-600" />
                      )}
                      <span className={passwordChecks.upper ? "text-slate-800" : ""}>Uppercase letter</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {passwordChecks.lower ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-slate-600" />
                      )}
                      <span className={passwordChecks.lower ? "text-slate-800" : ""}>Lowercase letter</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {passwordChecks.number ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-slate-600" />
                      )}
                      <span className={passwordChecks.number ? "text-slate-800" : ""}>One number</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      {passwordChecks.symbol ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-slate-600" />
                      )}
                      <span className={passwordChecks.symbol ? "text-slate-800" : ""}>
                        Special symbol (!@#$%^&*...)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-700">
                Confirm Password
              </label>
              <div className="relative mt-2">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs text-rose-500">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || (password.length > 0 && strengthScore < 100)}
              size="lg" className="mt-4 w-full"
            >
              {isLoading ? "Creating Account..." : "Create Account & Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
