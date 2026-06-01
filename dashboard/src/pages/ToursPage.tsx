import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Compass, Share2, Trash2, ExternalLink, Copy, Check, Box, Eye, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { tilt } from "@/lib/tilt";
import { Tour } from "@/types";
import { formatDate } from "@/lib/utils";

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

function ShareCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const digits = code.split("");

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "10px 14px", borderRadius: 14,
      background: "linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
      border: "1.5px solid transparent",
    }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, margin: 0, textTransform: "uppercase", ...headingGradient }}>
        Quest Code
      </p>
      <div style={{ display: "flex", gap: 4 }}>
        {digits.map((d, i) => (
          <div key={i} style={{
            width: 26, height: 32, borderRadius: 6,
            background: "linear-gradient(135deg,rgba(139,92,246,0.08),rgba(236,72,153,0.08))",
            border: "1px solid rgba(139,92,246,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: "#1a1d2e",
          }}>
            {d}
          </div>
        ))}
      </div>
      <button onClick={copy} style={{
        display: "flex", alignItems: "center", gap: 4,
        fontSize: 10, fontWeight: 600,
        color: copied ? "#22c55e" : "#9ca3af",
        background: "none", border: "none", cursor: "pointer", padding: 0,
      }}>
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? "Copied!" : "Copy code"}
      </button>
    </div>
  );
}

export default function ToursPage() {
  const qc = useQueryClient();

  const { data: tours = [], isLoading } = useQuery<Tour[]>({
    queryKey: ["tours"],
    queryFn: () => api.get("/api/tours").then((r) => r.data.items),
  });

  const generateTokenMutation = useMutation({
    mutationFn: (tourId: string) => api.post(`/api/tours/${tourId}/token`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tours"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tours/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tours"] }),
  });

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
            boxShadow: "0 4px 16px rgba(139,92,246,0.3)",
          }}>
            <Box size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, ...headingGradient }}>
              Spatial Assets
            </h1>
            <p style={{ fontSize: 13, color: "#8b5cf6", margin: 0 }}>
              Manage and share your virtual reality property tours
            </p>
          </div>
        </div>

        {/* Stats row */}
        {!isLoading && tours.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            {[
              { label: "Total Tours", value: tours.length, icon: Compass, color: "#8b5cf6" },
              { label: "Total Scenes", value: tours.reduce((a, t) => a + t.scenes.length, 0), icon: Layers, color: "#06b6d4" },
              { label: "Total Views", value: tours.reduce((a, t) => a + t.view_count, 0), icon: Eye, color: "#ec4899" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{
                ...glass, padding: "14px 20px",
                display: "flex", alignItems: "center", gap: 14, flex: 1,
              }} {...tilt}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  background: `${color}18`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={18} color={color} />
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "#1a1d2e", margin: 0, lineHeight: 1.2 }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{
              ...glass, height: 88,
              background: "linear-gradient(90deg,rgba(255,255,255,0.4) 25%,rgba(255,255,255,0.65) 50%,rgba(255,255,255,0.4) 75%)",
              animation: "shimmer 1.5s infinite", backgroundSize: "400px 100%",
            }} />
          ))}
        </div>

      ) : tours.length === 0 ? (

        /* ── Empty state ── */
        <div style={{ ...glass, padding: "64px 32px", textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20, margin: "0 auto 20px",
            background: "linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.08))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Box size={28} color="#8b5cf6" />
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: "#1a1d2e", margin: "0 0 8px" }}>No spatial assets yet</p>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
            Go to a property and click <strong style={{ color: "#8b5cf6" }}>"Build VR Tour"</strong> to create one
          </p>
        </div>

      ) : (

        /* ── Tour list ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tours.map((tour) => (
            <div key={tour.id} style={{
              ...glass, padding: "18px 20px",
              display: "flex", alignItems: "center", gap: 16,
            }} {...tilt}>
              {/* Icon */}
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: "linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.08))",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Compass size={22} color="#8b5cf6" />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#1a1d2e", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tour.name}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    {tour.scenes.length} scene{tour.scenes.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#d1d5db", display: "inline-block" }} />
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{tour.view_count} views</span>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#d1d5db", display: "inline-block" }} />
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatDate(tour.created_at)}</span>
                </div>
              </div>

              {/* Quest code */}
              {tour.share_code && <ShareCodeBadge code={tour.share_code} />}

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {tour.share_url ? (
                  <a href={tour.share_url} target="_blank" rel="noopener noreferrer" style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none",
                    boxShadow: "0 4px 12px rgba(139,92,246,0.3)",
                  }}>
                    <ExternalLink size={13} /> Open Tour
                  </a>
                ) : (
                  <button
                    onClick={() => generateTokenMutation.mutate(tour.id)}
                    disabled={generateTokenMutation.isPending}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 16px", borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(139,92,246,0.3)",
                      opacity: generateTokenMutation.isPending ? 0.6 : 1,
                    }}>
                    <Share2 size={13} /> Generate Link
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(tour.id)}
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: "none",
                    background: "rgba(239,68,68,0.06)", color: "#d1d5db",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#ef4444"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; e.currentTarget.style.color = "#d1d5db"; }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
