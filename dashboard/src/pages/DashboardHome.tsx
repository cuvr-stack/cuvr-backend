import { useQuery } from "@tanstack/react-query";
import {
  Building2, Image, Compass, HardDrive,
  Plus, MapPin, Clock, CheckCircle2, Loader2,
  Cpu, Zap, Shield, ChevronRight,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { getPlan } from "@/lib/plans";
import { tilt } from "@/lib/tilt";

interface DashboardStats {
  property_count: number;
  photo_count: number;
  tour_count: number;
  storage_used_gb: number;
  processing_queue: number;
  recent_properties: any[];
}

// ── Glassmorphism stat card ────────────────────────────────────────────────────
function StatCard({
  label, value, sub, badge, badgeColor, icon: Icon, gradient, barPct,
}: {
  label: string;
  value: string | number;
  sub?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ElementType;
  gradient: string;
  barPct?: number;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1.5px solid transparent",
      borderRadius: 20,
      padding: "20px 20px 18px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
      display: "flex", flexDirection: "column", gap: 12,
    }} {...tilt}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 42, height: 42, borderRadius: 14,
          background: gradient,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        }}>
          <Icon size={18} color="#fff" />
        </div>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
            background: badgeColor ? `${badgeColor}18` : "rgba(16,185,129,0.1)",
            color: badgeColor ?? "#10b981",
            border: `1px solid ${badgeColor ? `${badgeColor}30` : "rgba(16,185,129,0.2)"}`,
          }}>
            {badge}
          </span>
        )}
      </div>

      {/* Value */}
      <div>
        <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#1a1d2e", letterSpacing: -0.5, lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.3, textTransform: "uppercase" }}>
          {label}
        </p>
      </div>

      {/* Optional progress bar */}
      {barPct !== undefined && (
        <div style={{ height: 4, borderRadius: 4, background: "rgba(0,0,0,0.06)" }}>
          <div style={{
            height: "100%", borderRadius: 4, width: `${Math.min(barPct, 100)}%`,
            background: "linear-gradient(90deg,#10b981,#34d399)",
          }} />
        </div>
      )}

      {sub && (
        <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{sub}</p>
      )}
    </div>
  );
}

// ── Property card ─────────────────────────────────────────────────────────────
function PropertyCard({ property }: { property: any }) {
  const colors = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6"];
  const color  = colors[property.name?.charCodeAt(0) % colors.length] ?? "#6366f1";

  return (
    <Link to={`/dashboard/properties/${property.id}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1.5px solid transparent",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        cursor: "pointer",
      }}
        {...tilt}
      >
        {/* Image / placeholder */}
        <div style={{
          height: 160, position: "relative",
          background: `linear-gradient(135deg, ${color}22, ${color}44)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Building2 size={40} color={color} style={{ opacity: 0.5 }} />
          {/* Badge */}
          <div style={{
            position: "absolute", top: 12, right: 12,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
            borderRadius: 20, padding: "4px 10px",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>
            {property.photo_count > 0 ? "📸 Photos" : "New"}
          </div>
        </div>
        {/* Info */}
        <div style={{ padding: "12px 14px 14px" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1d2e", marginBottom: 6 }}>
            {property.name}
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={11} color="#9ca3af" />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{property.address || "No address"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} color="#9ca3af" />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                {new Date(property.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function ActivityPanel({ stats }: { stats?: DashboardStats }) {
  const items = [
    {
      icon: CheckCircle2, color: "#10b981",
      title: "Active Engine Status",
      sub: "All systems operational",
      dot: true,
    },
    {
      icon: Cpu, color: "#8b5cf6",
      title: "Processing Complete",
      sub: `${stats?.photo_count ?? 0} photos processed`,
    },
    {
      icon: Loader2, color: "#f59e0b",
      title: "Model Optimisation",
      sub: stats?.processing_queue
        ? `${stats.processing_queue} item${stats.processing_queue > 1 ? "s" : ""} in queue…`
        : "Queue empty",
      spin: !!stats?.processing_queue,
    },
    {
      icon: Shield, color: "#3b82f6",
      title: "Spatial Keys",
      sub: "Secure & up to date",
    },
  ];

  // Simple bar data
  const bars = [3, 5, 4, 6, 5, 8, 7];

  return (
    <div style={{
      background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1.5px solid transparent",
      borderRadius: 20,
      padding: "18px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      display: "flex", flexDirection: "column", gap: 0,
    }}>
      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#1a1d2e" }}>
        Activity
      </p>

      {items.map((item, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 0",
          borderBottom: i < items.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: `${item.color}15`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <item.icon
              size={14}
              color={item.color}
              style={item.spin ? { animation: "spin 1.2s linear infinite" } : {}}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {item.dot && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
              )}
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#1a1d2e" }}>{item.title}</p>
            </div>
            <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>{item.sub}</p>
          </div>
        </div>
      ))}

      {/* Network load */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "#9ca3af", textTransform: "uppercase" }}>
            Network Load
          </p>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: "rgba(16,185,129,0.1)", color: "#10b981",
          }}>Normal</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 36 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{
                height: `${(h / 10) * 36}px`,
                borderRadius: 3,
                background: i === bars.length - 2
                  ? "linear-gradient(180deg,#8b5cf6,#6366f1)"
                  : "rgba(0,0,0,0.1)",
              }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardHome() {
  const user    = useAuthStore((s) => s.user);
  const plan    = getPlan(user?.subscription_plan ?? "free");
  const navigate = useNavigate();
  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.get("/api/dashboard/stats").then((r) => r.data),
  });

  const storageUsed = stats?.storage_used_gb ?? 0;
  const storageMax  = plan?.limits?.storageGB ?? 10;

  const statCards = [
    {
      label: "Total Properties",
      value: stats?.property_count ?? 0,
      badge: plan?.limits?.properties ? `/ ${plan.limits.properties}` : undefined,
      badgeColor: "#10b981",
      icon: Building2,
      gradient: "linear-gradient(135deg,#10b981,#34d399)",
    },
    {
      label: "Photos Processed",
      value: stats?.photo_count ? `+${(stats.photo_count / 1000).toFixed(1)}k` : "0",
      badge: stats?.photo_count ? `+${stats.photo_count}` : undefined,
      badgeColor: "#ec4899",
      icon: Image,
      gradient: "linear-gradient(135deg,#ec4899,#f472b6)",
    },
    {
      label: "Active Nodes",
      badge: stats?.processing_queue ? `${stats.processing_queue} active` : "Idle",
      badgeColor: "#10b981",
      value: stats?.tour_count ?? 0,
      icon: Compass,
      gradient: "linear-gradient(135deg,#06b6d4,#38bdf8)",
      barPct: stats?.processing_queue ? Math.min(stats.processing_queue * 10, 100) : 5,
    },
    {
      label: "Storage Used",
      value: `${storageUsed.toFixed(1)} GB`,
      sub: `of ${storageMax} GB`,
      badge: storageUsed / storageMax < 0.5 ? "Top 1%" : undefined,
      badgeColor: "#f59e0b",
      icon: HardDrive,
      gradient: "linear-gradient(135deg,#f59e0b,#fbbf24)",
    },
  ];

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out" }}>

      {/* ── Welcome + CTA ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 28,
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: -1, lineHeight: 1.15,
            background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            Welcome back, {firstName}.
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", maxWidth: 460, lineHeight: 1.6 }}>
            Your AI Spatial Engine has processed{" "}
            <strong style={{ color: "#374151" }}>{stats?.photo_count ?? 0} photos</strong> in total.
            {stats?.processing_queue ? ` ${stats.processing_queue} item${stats.processing_queue > 1 ? "s" : ""} currently processing.` : ""}
          </p>
        </div>

        <button
          onClick={() => navigate("/dashboard/properties")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "11px 22px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
            flexShrink: 0,
            transition: "opacity 0.15s, transform 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.opacity = "0.9";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.opacity = "1";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          }}
        >
          <Plus size={16} />
          New Property
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4,1fr)",
        gap: 16,
        marginBottom: 24,
      }}>
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      {/* ── Lower row: properties + activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

        {/* Recent properties */}
        <div>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a1d2e" }}>Recent Properties</p>
            <Link
              to="/dashboard/properties"
              style={{
                display: "flex", alignItems: "center", gap: 4, textDecoration: "none",
                fontSize: 12, fontWeight: 600, color: "#8b5cf6",
              }}
            >
              View All <ChevronRight size={13} />
            </Link>
          </div>

          {stats?.recent_properties?.length ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
              gap: 14,
            }}>
              {stats.recent_properties.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          ) : (
            <div style={{
              background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1.5px solid transparent",
              borderRadius: 20,
              padding: "48px 24px",
              textAlign: "center",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, margin: "0 auto 14px",
                background: "linear-gradient(135deg,#8b5cf618,#6366f118)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Building2 size={22} color="#8b5cf6" />
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#1a1d2e" }}>
                No properties yet
              </p>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>
                Add your first property to get started
              </p>
              <Link
                to="/dashboard/properties"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "9px 20px", borderRadius: 12,
                  background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
                }}
              >
                <Plus size={14} /> Add Property
              </Link>
            </div>
          )}
        </div>

        {/* Activity panel */}
        <ActivityPanel stats={stats} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
