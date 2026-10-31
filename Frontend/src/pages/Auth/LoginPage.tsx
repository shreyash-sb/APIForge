import { Eye, EyeOff, KeyRound, Lock, Mail, Terminal } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/useAuthStore";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    if (!email.trim() || !password) {
      setLocalError("Please enter your email and password.");
      return;
    }

    const res = await login(email, password, rememberMe);
    if (res.success) {
      navigate("/dashboard");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F5F5F7] px-4 py-12 sm:px-6 lg:px-8">

      <div className="relative w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center rounded-[14px] bg-blue-600 p-3">
            <Terminal className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-[28px] font-semibold text-slate-900">APIForge</h1>
          <p className="mt-2 text-sm text-slate-500">
            Secure sign in to your API development & testing workspace
          </p>
        </div>

        {/* Card */}
        <div className="mt-8 rounded-2xl border border-black/[0.06] bg-white p-8 shadow-panel">
          {(error || localError) && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span>{error || localError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[13px] text-slate-700">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                />
                Remember this device (7 days)
              </label>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              size="lg" className="w-full"
            >
              {isLoading ? (
                "Signing In..."
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>


          <p className="mt-6 text-center text-sm text-slate-500">
            Don&apos;t have an account yet?{" "}
            <Link to="/signup" className="font-semibold text-blue-600 hover:underline">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
