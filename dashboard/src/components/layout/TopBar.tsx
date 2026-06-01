import { Bell, Search, Moon, LayoutGrid } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function TopBar() {
  const user = useAuthStore((s) => s.user);
  const initials = user?.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "U";

  return (
    <header
      style={{
        height: 60,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 12,
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    >
      {/* Search */}
      <div style={{
        flex: 1, maxWidth: 380, position: "relative",
        display: "flex", alignItems: "center",
        background: "rgba(255,255,255,0.8)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12, padding: "0 14px", height: 38,
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      }}>
        <Search size={14} color="#9ca3af" style={{ flexShrink: 0, marginRight: 8 }} />
        <input
          type="text"
          placeholder="Search spatial assets, projects..."
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 13, color: "#374151",
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Icon buttons */}
      {[Bell, Moon, LayoutGrid].map((Icon, i) => (
        <button
          key={i}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.8)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,1)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.8)")}
        >
          <Icon size={15} color="#6b7280" />
          {i === 0 && (
            <span style={{
              position: "absolute", top: 7, right: 7,
              width: 6, height: 6, borderRadius: "50%",
              background: "#00e676",
              boxShadow: "0 0 0 1.5px #edf0fb",
            }} />
          )}
        </button>
      ))}

      {/* Divider */}
      <div style={{ width: 1, height: 24, background: "rgba(0,0,0,0.08)" }} />

      {/* Role + Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#9ca3af", textTransform: "uppercase" }}>
          {user?.subscription_plan === "enterprise" ? "Senior Architect" : user?.subscription_plan === "professional" ? "Architect" : "Explorer"}
        </span>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: "#fff",
          cursor: "pointer", flexShrink: 0,
          boxShadow: "0 2px 8px rgba(139,92,246,0.35)",
        }}>
          {initials}
        </div>
      </div>
    </header>
  );
}
