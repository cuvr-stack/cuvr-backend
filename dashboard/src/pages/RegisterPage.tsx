import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import AuthLayout from "@/components/auth/AuthLayout";

const PRIMARY = "rgb(236, 72, 153)";

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak",        color: "#ef4444" };
  if (score <= 2) return { score, label: "Fair",        color: "#f97316" };
  if (score <= 3) return { score, label: "Good",        color: "#eab308" };
  if (score <= 4) return { score, label: "Strong",      color: "#22c55e" };
  return             { score, label: "Very Strong", color: PRIMARY };
}

export default function RegisterPage() {
  const [fullName, setFullName]           = useState("");
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [error, setError]                 = useState("");
  const { register, isLoading }           = useAuthStore();
  const navigate                          = useNavigate();

  const strength = getPasswordStrength(password);
  const confirmMatch    = confirmPassword && password === confirmPassword;
  const confirmMismatch = confirmPassword && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await register(email, password, fullName);
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Registration failed.");
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 0,
  };

  return (
    <AuthLayout>
      {/* Avatar */}
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 flex items-center justify-center"
          style={{ background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.35)", borderRadius: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-9 h-9" stroke={PRIMARY} strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
          </svg>
        </div>
      </div>

      <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: "1.875rem", color: "#fff", textAlign: "center", marginBottom: "0.25rem", letterSpacing: "-0.5px" }}>Create Account</h1>
      <p className="text-center text-sm mb-8" style={{ color: "rgba(255,255,255,0.6)" }}>
        Start your 14-day free trial — no credit card required
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="text-sm font-medium mb-1.5 block" style={{ color: "#ffffff" }}>Full Name</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              required placeholder="John Smith"
              className="w-full pl-10 pr-4 py-3 text-sm text-white outline-none transition-all"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = PRIMARY)}
              onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="text-sm font-medium mb-1.5 block" style={{ color: "#ffffff" }}>Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" placeholder="name@company.com"
              className="w-full pl-10 pr-4 py-3 text-sm text-white outline-none transition-all"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = PRIMARY)}
              onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="text-sm font-medium mb-1.5 block" style={{ color: "#ffffff" }}>Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              type={showPassword ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              required autoComplete="new-password" placeholder="Min. 8 characters"
              className="w-full pl-10 pr-11 py-3 text-sm text-white outline-none transition-all"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = PRIMARY)}
              onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.5)" }}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {password && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-1 flex-1 transition-all duration-300"
                    style={{
                      borderRadius: 0,
                      background: i <= strength.score ? strength.color : "rgba(255,255,255,0.1)",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Password strength</p>
                <p className="text-xs font-semibold" style={{ color: strength.color }}>
                  {strength.label}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                {[
                  { ok: password.length >= 8,          text: "8+ characters" },
                  { ok: /[A-Z]/.test(password),        text: "Uppercase letter" },
                  { ok: /[0-9]/.test(password),        text: "Number" },
                  { ok: /[^A-Za-z0-9]/.test(password), text: "Special character" },
                ].map(({ ok, text }) => (
                  <p key={text} className="text-xs flex items-center gap-1"
                    style={{ color: ok ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                    <span>{ok ? "✓" : "·"}</span> {text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="text-sm font-medium mb-1.5 block" style={{ color: "#ffffff" }}>Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              type={showConfirm ? "text" : "password"} value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required autoComplete="new-password" placeholder="Re-enter your password"
              className="w-full pl-10 pr-11 py-3 text-sm text-white outline-none transition-all"
              style={{
                ...inputStyle,
                borderColor: confirmMismatch
                  ? "#ef4444"
                  : confirmMatch
                  ? "#22c55e"
                  : "rgba(255,255,255,0.1)",
              }}
              onFocus={e => (e.target.style.borderColor = confirmMismatch ? "#ef4444" : confirmMatch ? "#22c55e" : PRIMARY)}
              onBlur={e => (e.target.style.borderColor = confirmMismatch ? "#ef4444" : confirmMatch ? "#22c55e" : "rgba(255,255,255,0.1)")}
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.5)" }}>
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            {confirmMatch && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#22c55e" }}>✓</span>
            )}
          </div>
          {confirmMismatch && (
            <p className="text-xs mt-1" style={{ color: "#ef4444" }}>Passwords do not match</p>
          )}
        </div>

        {error && <p className="text-sm" style={{ color: "#ff4d6d" }}>{error}</p>}

        <button type="submit" disabled={isLoading}
          className="w-full py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
            borderRadius: 0,
            border: "none",
            boxShadow: "0 4px 20px rgba(236,72,153,0.35)",
            fontWeight: 800,
          }}>
          {isLoading ? "Creating account…" : "Create Account"}
        </button>
      </form>

      <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.6)" }}>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold hover:opacity-80 transition-opacity"
            style={{ color: PRIMARY }}>
            Sign In
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
