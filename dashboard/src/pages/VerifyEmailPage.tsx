import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Mail, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import AuthLayout from "@/components/auth/AuthLayout";

const PRIMARY = "#00e676";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const { fetchMe } = useAuthStore();

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const handleChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...code];
    next[i] = val.slice(-1);
    setCode(next);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setCode(text.split(""));
      refs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length < 6) { setError("Enter the 6-digit code"); return; }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/verify-email", { email, code: fullCode });
      useAuthStore.setState({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        isAuthenticated: true,
      });
      await fetchMe();
      navigate("/dashboard/subscription");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Invalid code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    try {
      await api.post("/api/auth/resend-verification", { email });
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  const inputStyle = {
    width: 48, height: 56,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
    textAlign: "center" as const,
    outline: "none",
  };

  return (
    <AuthLayout>
      {/* Icon */}
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(0,230,118,0.15)", border: "1px solid rgba(0,230,118,0.35)" }}>
          <Mail className="w-8 h-8" style={{ color: PRIMARY }} />
        </div>
      </div>

      <h1 className="text-3xl font-bold text-white text-center mb-1">Check your email</h1>
      <p className="text-center text-sm mb-2" style={{ color: "#ffffff" }}>
        We sent a 6-digit code to
      </p>
      <p className="text-center text-sm font-semibold mb-8" style={{ color: "#fff" }}>
        {email}
      </p>

      <form onSubmit={handleSubmit}>
        {/* Code inputs */}
        <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={el => { refs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              style={{
                ...inputStyle,
                borderColor: digit ? PRIMARY : "rgba(255,255,255,0.1)",
              }}
              onFocus={e => (e.target.style.borderColor = PRIMARY)}
              onBlur={e => (e.target.style.borderColor = digit ? PRIMARY : "rgba(255,255,255,0.1)")}
            />
          ))}
        </div>

        {error && <p className="text-sm text-center mb-4" style={{ color: "#ff4d6d" }}>{error}</p>}
        {resent && <p className="text-sm text-center mb-4" style={{ color: "#22c55e" }}>Code resent!</p>}

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
          {loading ? "Verifying..." : "Verify Email"}
        </button>
      </form>

      <div className="mt-6 pt-5 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-sm mb-3" style={{ color: "#ffffff" }}>Didn't receive the code?</p>
        <button onClick={handleResend} disabled={resending}
          className="flex items-center gap-2 mx-auto text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ color: PRIMARY }}>
          <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
          {resending ? "Sending..." : "Resend code"}
        </button>
        <p className="text-xs mt-4" style={{ color: "#ffffff" }}>
          Wrong email?{" "}
          <Link to="/register" className="font-semibold" style={{ color: PRIMARY }}>
            Go back
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
