import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
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
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
  };

  return (
    <AuthLayout>
      {/* Avatar */}
      <div className="flex justify-center mb-5">
        <div className="w-14 h-14 flex items-center justify-center"
          style={{ background: "rgba(236,72,153,0.18)", border: "1.5px solid rgba(236,72,153,0.4)", borderRadius: "50%" }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke={PRIMARY} strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      </div>

      <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: "1.6rem", color: "#fff", textAlign: "center", marginBottom: "0.35rem", letterSpacing: "-0.3px" }}>Welcome Back</h1>
      <p className="text-center text-sm mb-7" style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
        Access your spatial ecosystem
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 8 }}>Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.35)" }} />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" placeholder="name@company.com"
              className="w-full pl-10 pr-4 py-3 text-sm text-white outline-none transition-all"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = PRIMARY; e.target.style.boxShadow = "0 0 0 3px rgba(236,72,153,0.12)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Password</label>
            <button type="button" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: PRIMARY, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              FORGOT?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.35)" }} />
            <input
              type={showPassword ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" placeholder="••••••••"
              className="w-full pl-10 pr-11 py-3 text-sm text-white outline-none transition-all"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = PRIMARY; e.target.style.boxShadow = "0 0 0 3px rgba(236,72,153,0.12)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: "#ff4d6d" }}>{error}</p>}

        <button type="submit" disabled={isLoading}
          className="w-full py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
            borderRadius: 12,
            border: "none",
            boxShadow: "0 6px 24px rgba(236,72,153,0.4)",
            fontWeight: 800,
            fontSize: 15,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 8,
          }}>
          {isLoading ? "Signing in…" : (
            <>Sign In <ArrowRight size={16} /></>
          )}
        </button>
      </form>

      <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
          New to CUVR.REALTY?{" "}
          <Link to="/register" className="font-semibold hover:opacity-80 transition-opacity"
            style={{ color: PRIMARY }}>
            Sign Up
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
