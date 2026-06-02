import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import AuthLayout from "@/components/auth/AuthLayout";

const PRIMARY = "rgb(236, 72, 153)";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      setError("Invalid email or password.");
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
              d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      </div>

      <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: "1.875rem", color: "#fff", textAlign: "center", marginBottom: "0.25rem", letterSpacing: "-0.5px" }}>Welcome Back</h1>
      <p className="text-center text-sm mb-8" style={{ color: "rgba(255,255,255,0.6)" }}>
        Access your spatial ecosystem
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium" style={{ color: "#ffffff" }}>Password</label>
            <button type="button" className="text-xs font-medium hover:opacity-80 transition-opacity"
              style={{ color: PRIMARY }}>
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              type={showPassword ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" placeholder="••••••••"
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
          {isLoading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.6)" }}>
          New to cuvr.realty?{" "}
          <Link to="/register" className="font-semibold hover:opacity-80 transition-opacity"
            style={{ color: PRIMARY }}>
            Sign Up
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
