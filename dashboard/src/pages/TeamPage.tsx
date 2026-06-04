import { useState } from "react";
import { Users, Mail, UserPlus, Crown, Shield, Eye, Trash2 } from "lucide-react";
import { tilt } from "@/lib/tilt";

const glass = {
  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid transparent",
  borderRadius: 20,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

const headingGradient = {
  background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
} as const;

const ROLES = [
  { id: "admin",  label: "Admin",   icon: Crown,  color: "#f59e0b", desc: "Full access" },
  { id: "editor", label: "Editor",  icon: Shield, color: "#8b5cf6", desc: "Can edit projects" },
  { id: "viewer", label: "Viewer",  icon: Eye,    color: "#06b6d4", desc: "View only" },
];

// Mock team members — replace with API data
const MOCK_MEMBERS = [
  { id: 1, name: "You (Owner)", email: "owner@cuvr.ae", role: "admin",  avatar: "Y" },
];

export default function TeamPage() {
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState("editor");
  const [invited, setInvited] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setInvited(true);
    setEmail("");
    setTimeout(() => setInvited(false), 3000);
  };

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out", maxWidth: 760 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 14,
          background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(139,92,246,0.3)",
        }}>
          <Users size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, ...headingGradient }}>
            Team
          </h1>
          <p style={{ fontSize: 13, color: "#8b5cf6", margin: 0 }}>
            Manage your team members and permissions
          </p>
        </div>
      </div>

      {/* Invite card */}
      <div style={{ ...glass, padding: 24, marginBottom: 20 }} {...tilt}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#8b5cf6", textTransform: "uppercase", margin: "0 0 16px" }}>
          Invite Team Member
        </p>
        <form onSubmit={handleInvite} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {/* Email input */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 6px" }}>Email</p>
            <div style={{ position: "relative" }}>
              <Mail size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="colleague@company.com" required
                style={{
                  width: "100%", paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
                  fontSize: 13, borderRadius: 10, outline: "none",
                  background: "rgba(255,255,255,0.8)", border: "1.5px solid rgba(255,255,255,0.6)", color: "#1a1d2e",
                  boxSizing: "border-box",
                }}
                onFocus={e => (e.target.style.borderColor = "#8b5cf6")}
                onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.6)")}
              />
            </div>
          </div>

          {/* Role selector */}
          <div style={{ minWidth: 140 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 6px" }}>Role</p>
            <select
              value={role} onChange={e => setRole(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", fontSize: 13, borderRadius: 10, outline: "none",
                background: "rgba(255,255,255,0.8)", border: "1.5px solid rgba(255,255,255,0.6)", color: "#1a1d2e", cursor: "pointer",
              }}
            >
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>)}
            </select>
          </div>

          {/* Button */}
          <button type="submit" style={{
            display: "flex", alignItems: "center", gap: 7, padding: "10px 20px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: "pointer", boxShadow: "0 4px 14px rgba(139,92,246,0.3)", whiteSpace: "nowrap",
          }}>
            <UserPlus size={14} /> Send Invite
          </button>
        </form>

        {invited && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#22c55e", fontWeight: 600 }}>✓ Invitation sent!</p>
          </div>
        )}
      </div>

      {/* Members list */}
      <div style={{ ...glass, padding: 24 }} {...tilt}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#8b5cf6", textTransform: "uppercase", margin: "0 0 16px" }}>
          Members ({MOCK_MEMBERS.length})
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MOCK_MEMBERS.map(member => {
            const memberRole = ROLES.find(r => r.id === member.role)!;
            const RoleIcon = memberRole.icon;
            return (
              <div key={member.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 16px", borderRadius: 12,
                background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.8)",
              }}>
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 800, color: "#fff",
                }}>
                  {member.avatar}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1d2e" }}>{member.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{member.email}</p>
                </div>
                {/* Role badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20,
                  background: `${memberRole.color}15`, border: `1px solid ${memberRole.color}30`,
                }}>
                  <RoleIcon size={11} color={memberRole.color} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: memberRole.color }}>{memberRole.label}</span>
                </div>
                {/* Remove (disabled for owner) */}
                {member.role !== "admin" && (
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#d1d5db")}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#8b5cf6" }}>
            💡 Team collaboration requires an <strong>Enterprise</strong> plan. <a href="/dashboard/subscription" style={{ color: "#ec4899", fontWeight: 700, textDecoration: "none" }}>Upgrade →</a>
          </p>
        </div>
      </div>
    </div>
  );
}
