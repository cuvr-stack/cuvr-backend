import { useState } from "react";
import { HelpCircle, Globe } from "lucide-react";
import { useGoogleLogin } from "@react-oauth/google";
import { useSocialAuth } from "@/hooks/useSocialAuth";

const PRIMARY = "rgb(236, 72, 153)";
const PRIMARY_HEX = "#ec4899";

const BrandName = ({ size = 20 }: { size?: number }) => (
  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: size, fontWeight: 800, letterSpacing: 1, lineHeight: 1 }}>
    <span style={{ color: "#ffffff" }}>cuvr</span>
    <span style={{ color: PRIMARY }}>.</span>
    <span style={{ color: PRIMARY }}>realty</span>
  </span>
);

interface AuthLayoutProps {
  children: React.ReactNode;
  showSocial?: boolean;
}

export default function AuthLayout({ children, showSocial = true }: AuthLayoutProps) {
  const { loginWithGoogle, loginWithApple } = useSocialAuth();
  const [socialError, setSocialError] = useState("");

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const info = await res.json();
        await loginWithGoogle(tokenResponse.access_token);
      } catch {
        setSocialError("Google login failed. Please try again.");
      }
    },
    onError: () => setSocialError("Google login was cancelled."),
  });

  const handleAppleLogin = () => {
    const w = window as any;
    if (!w.AppleID) {
      setSocialError("Apple Sign In is not available in this browser.");
      return;
    }
    w.AppleID.auth.signIn().then(async (res: any) => {
      try {
        const token = res.authorization.id_token;
        const name = res.user
          ? `${res.user.name?.firstName ?? ""} ${res.user.name?.lastName ?? ""}`.trim()
          : undefined;
        await loginWithApple(token, name);
      } catch {
        setSocialError("Apple login failed. Please try again.");
      }
    }).catch(() => setSocialError("Apple login was cancelled."));
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0f1117" }}>

      {/* Nav */}
      <nav
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-5"
        style={{ borderBottom: `1px solid rgba(236,72,153,0.18)` }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <img src="/cuvr-logo.png" alt="cuvr.realty" className="h-11 w-auto object-contain" />
          <BrandName size={18} />
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <HelpCircle className="w-5 h-5 text-white/50" />
          </button>
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Globe className="w-5 h-5 text-white/50" />
          </button>
        </div>
      </nav>

      {/* Main */}
      <div className="flex flex-1 items-center justify-center px-4 py-24">
        <div
          className="flex w-full max-w-4xl rounded-2xl overflow-hidden"
          style={{
            border: `1px solid rgba(236,72,153,0.3)`,
            boxShadow: "0 0 80px rgba(236,72,153,0.1)",
          }}
        >
          {/* Left — video panel */}
          <div className="hidden lg:flex w-[420px] shrink-0 relative overflow-hidden flex-col justify-end">
            <video
              src="/home.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(15,17,23,0.92) 0%, rgba(15,17,23,0.3) 50%, rgba(15,17,23,0.1) 100%)",
              }}
            />
            <div className="relative z-10 p-8 pb-10">
              <h2 className="text-3xl font-bold text-white leading-tight mb-3">
                Design the<br />
                <span style={{ color: PRIMARY }}>Future</span>
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                Transform flat property photos into immersive VR walkthroughs.
                Let your clients explore spaces before they exist.
              </p>
              <div className="flex gap-2 mt-5">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-1 rounded-full"
                    style={{
                      width: i === 0 ? "24px" : "8px",
                      background: i === 0 ? PRIMARY : "rgba(255,255,255,0.3)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right — form slot */}
          <div
            className="flex-1 p-10 flex flex-col justify-center"
            style={{ background: "rgba(12,15,26,0.98)" }}
          >
            {children}

            {showSocial && (
              <>
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, color: "#ffffff" }}>OR CONTINUE WITH</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>

                {socialError && (
                  <p className="text-xs text-center mb-3" style={{ color: "#ff4d6d" }}>{socialError}</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* Google */}
                  <button
                    type="button"
                    onClick={() => { setSocialError(""); googleLogin(); }}
                    className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-white hover:opacity-80 transition-opacity"
                    style={{
                      borderRadius: 0,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                  </button>

                  {/* Apple */}
                  <button
                    type="button"
                    onClick={() => { setSocialError(""); handleAppleLogin(); }}
                    className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-white hover:opacity-80 transition-opacity"
                    style={{
                      borderRadius: 0,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="white">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    Apple
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        className="flex items-center justify-between px-8 py-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <img src="/cuvr-logo.png" alt="cuvr.realty" className="h-8 w-auto object-contain" />
          <BrandName size={13} />
        </div>
        <div className="flex items-center gap-6">
          {["Terms of Service", "Privacy Policy", "Accessibility", "Contact Support"].map(item => (
            <a key={item} href="#"
              className="text-xs hover:opacity-80 transition-opacity"
              style={{ color: "#ffffff" }}>
              {item}
            </a>
          ))}
        </div>
        <span className="text-xs" style={{ color: "#ffffff" }}>
          © 2025 cuvr.realty. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
