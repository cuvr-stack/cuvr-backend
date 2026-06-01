import { NavLink, useNavigate } from "react-router-dom";
import {
  Cpu, Layers, Box, ShoppingBag, Users, Settings,
  LogOut, HelpCircle, Zap,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard",              icon: Cpu,         label: "Dashboard",     end: true },
  { to: "/dashboard/properties",   icon: Layers,      label: "Projects" },
  { to: "/dashboard/tours",        icon: Box,         label: "Spatial Assets" },
  { to: "/dashboard/subscription", icon: ShoppingBag, label: "Marketplace" },
  { to: "/dashboard/settings",     icon: Users,       label: "Team" },
  { to: "/dashboard/settings",     icon: Settings,    label: "Settings" },
];

export default function Sidebar() {
  const logout   = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <aside
      className="flex flex-col shrink-0"
      style={{
        width: 230,
        background: "#181c2e",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ── Brand ── */}
      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <img src="/cuvr-logo.png" alt="CUVR" style={{ height: 50, width: "auto", objectFit: "contain" }} />
          <div>
            <p style={{
              margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 1.2,
              background: "linear-gradient(135deg,#f472b6,#a78bfa)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              CUVR REALTY
            </p>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: "#6b7fa0", textTransform: "uppercase" }}>
              AI Spatial Engine
            </p>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav style={{ flex: 1, padding: "8px 12px", overflow: "auto" }}>
        {navItems.map(({ to, icon: Icon, label, end }, idx) => (
          <NavLink
            key={`${to}-${idx}`}
            to={to}
            end={end}
            style={{ textDecoration: "none", display: "block", marginBottom: 2 }}
          >
            {({ isActive }) => (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10,
                background: isActive ? "rgba(167,139,250,0.15)" : "transparent",
                transition: "background 0.15s",
                cursor: "pointer",
              }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                <Icon
                  size={15}
                  style={{ color: isActive ? "#a78bfa" : "#6b7fa0", flexShrink: 0 }}
                />
                <span style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#e2d9fe" : "#8892a4",
                }}>
                  {label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Upgrade card ── */}
      <div style={{ padding: "0 12px 12px" }}>
        <div style={{
          borderRadius: 14,
          padding: "14px 14px 12px",
          background: "linear-gradient(135deg,rgba(139,92,246,0.18),rgba(236,72,153,0.12))",
          border: "1px solid rgba(167,139,250,0.2)",
          marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0,
              background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Zap size={13} color="#fff" />
            </div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e2d9fe" }}>Upgrade to PRO</p>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "#8892a4", lineHeight: 1.5 }}>
            Unlock unlimited spatial rendering and team collaboration tools.
          </p>
          <button
            onClick={() => navigate("/dashboard/subscription")}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 8, border: "none",
              background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            Upgrade Now
          </button>
        </div>

        {/* Help & Logout */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 2px" }}>
          <button
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6b7fa0", fontSize: 12 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#a78bfa")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6b7fa0")}
          >
            <HelpCircle size={13} /> Help Center
          </button>
          <button
            onClick={logout}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6b7fa0", fontSize: 12 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6b7fa0")}
          >
            <LogOut size={13} /> Log Out
          </button>
        </div>
      </div>
    </aside>
  );
}
