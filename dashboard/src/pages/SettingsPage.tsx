import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";

const TIMEOUT_OPTIONS: { label: string; value: number | null }[] = [
  { label: "15 minutes",  value: 15   },
  { label: "30 minutes",  value: 30   },
  { label: "1 hour",      value: 60   },
  { label: "2 hours",     value: 120  },
  { label: "Never",       value: null },
];

export default function SettingsPage() {
  const user    = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [fullName, setFullName]           = useState(user?.full_name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]     = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const sessionTimeoutMinutes = useSettingsStore((s) => s.sessionTimeoutMinutes);
  const setSessionTimeout     = useSettingsStore((s) => s.setSessionTimeout);
  const [timeoutSaved, setTimeoutSaved]   = useState(false);

  const profileMutation = useMutation({
    mutationFn: () => api.patch("/api/auth/me", { full_name: fullName }),
    onSuccess: async () => {
      await fetchMe();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.post("/api/auth/change-password", {
      current_password: currentPassword, new_password: newPassword,
    }),
    onSuccess: () => {
      setCurrentPassword(""); setNewPassword("");
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
  });

  return (
    <div className="space-y-5 max-w-md animate-fadeIn">
      <h1>Settings</h1>

      {/* ── Profile ── */}
      <div className="card card-shadow rounded-2xl p-5 space-y-4">
        <h2>Profile</h2>

        <div>
          <p className="label mb-1.5">Full Name</p>
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <p className="label mb-1.5">Email</p>
          <input
            value={user?.email ?? ""}
            disabled
            className="input"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
          />
        </div>

        {profileSuccess && (
          <div className="flex items-center gap-2" style={{ color: "#22c55e" }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="t-sm font-medium">Profile updated</span>
          </div>
        )}

        <button
          onClick={() => profileMutation.mutate()}
          disabled={profileMutation.isPending}
          className="btn btn-primary"
        >
          {profileMutation.isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* ── Password ── */}
      <div className="card card-shadow rounded-2xl p-5 space-y-4">
        <h2>Change Password</h2>

        <div>
          <p className="label mb-1.5">Current Password</p>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="input"
            placeholder="••••••••"
          />
        </div>

        <div>
          <p className="label mb-1.5">New Password</p>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="input"
            placeholder="Min. 8 characters"
          />
        </div>

        {passwordSuccess && (
          <div className="flex items-center gap-2" style={{ color: "#22c55e" }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="t-sm font-medium">Password changed</span>
          </div>
        )}
        {passwordMutation.isError && (
          <p className="t-sm" style={{ color: "#f87171" }}>Failed to change password. Check your current password.</p>
        )}

        <button
          onClick={() => passwordMutation.mutate()}
          disabled={!currentPassword || !newPassword || passwordMutation.isPending}
          className="btn btn-primary"
        >
          {passwordMutation.isPending ? "Updating…" : "Update Password"}
        </button>
      </div>

      {/* ── Security ── */}
      <div className="card card-shadow rounded-2xl p-5 space-y-4">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.1))",
          }}>
            <ShieldCheck size={16} color="#8b5cf6" />
          </div>
          <h2 style={{ margin: 0 }}>Security</h2>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Clock size={13} color="#8b5cf6" />
            <p className="label" style={{ margin: 0 }}>Session Timeout</p>
          </div>
          <p className="t-sm" style={{ color: "#9ca3af", marginBottom: 12 }}>
            Automatically log out after this period of inactivity.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {TIMEOUT_OPTIONS.map((opt) => {
              const active = sessionTimeoutMinutes === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  onClick={() => { setSessionTimeout(opt.value); setTimeoutSaved(true); setTimeout(() => setTimeoutSaved(false), 2500); }}
                  style={{
                    padding: "9px 4px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    background: active
                      ? "linear-gradient(135deg,#8b5cf6,#ec4899)"
                      : "linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
                    border: "1.5px solid transparent",
                    color: active ? "#fff" : "#374151",
                    transition: "all 0.15s",
                    boxShadow: active ? "0 4px 12px rgba(139,92,246,0.3)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {timeoutSaved && (
            <div className="flex items-center gap-2" style={{ color: "#22c55e", marginTop: 12 }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="t-sm font-medium">Timeout preference saved</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
