import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api";
import { FEATURE_LABELS } from "@/lib/entitlements";
import { tilt } from "@/lib/tilt";

const glass = {
  background: "rgba(255,255,255,0.75)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid rgba(139,92,246,0.15)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

const STATUS_COLORS: Record<string, string> = {
  pending:  "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
};

type FeatureRequest = {
  id: string; property_id: string; user_id: string;
  feature: string; status: string; message: string | null;
  admin_note: string | null; created_at: string;
  property_name: string | null; user_email: string | null;
  entitlement_code: string | null;
};

export default function AdminPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: requests = [], isLoading } = useQuery<FeatureRequest[]>({
    queryKey: ["admin-requests", filter],
    queryFn: () => api.get(`/api/admin/feature-requests${filter !== "all" ? `?status=${filter}` : ""}`).then(r => r.data),
    refetchInterval: 30_000,
  });

  const approve = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.post(`/api/admin/feature-requests/${id}/approve`, { admin_note: notes[id] ?? null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-requests"] }); qc.invalidateQueries({ queryKey: ["pending-count"] }); },
  });

  const reject = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.post(`/api/admin/feature-requests/${id}/reject`, { admin_note: notes[id] ?? null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-requests"] }); qc.invalidateQueries({ queryKey: ["pending-count"] }); },
  });

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out", maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 14,
          background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(139,92,246,0.3)",
        }}>
          <Shield size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, background: "linear-gradient(135deg,#06b6d4,#8b5cf6,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Admin Panel
          </h1>
          <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>Feature access requests</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["pending", "approved", "rejected", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 700, textTransform: "capitalize",
            background: filter === f ? "linear-gradient(135deg,#8b5cf6,#ec4899)" : "rgba(255,255,255,0.7)",
            color: filter === f ? "#fff" : "#6b7280",
            transition: "all 0.15s",
          }}>{f}</button>
        ))}
      </div>

      {/* Request list */}
      {isLoading ? (
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading…</p>
      ) : requests.length === 0 ? (
        <div style={{ ...glass, padding: 32, textAlign: "center" }}>
          <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>No {filter} requests</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map(req => {
            const isExpanded = expanded === req.id;
            const featureLabel = FEATURE_LABELS[req.feature] ?? req.feature;
            const statusColor = STATUS_COLORS[req.status] ?? "#9ca3af";

            return (
              <div key={req.id} style={{ ...glass, overflow: "hidden" }} {...tilt}>
                {/* Row */}
                <div
                  style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                  onClick={() => setExpanded(isExpanded ? null : req.id)}
                >
                  {/* Status dot */}
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor, flexShrink: 0,
                    boxShadow: `0 0 6px ${statusColor}80` }} />

                  {/* Feature badge */}
                  <div style={{
                    padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: "linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.08))",
                    color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.2)", whiteSpace: "nowrap",
                  }}>
                    {featureLabel}
                  </div>

                  {/* Project + user */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1a1d2e",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {req.property_name ?? req.property_id}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{req.user_email}</p>
                  </div>

                  {/* Date */}
                  <p style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, margin: 0 }}>
                    {new Date(req.created_at).toLocaleDateString()}
                  </p>

                  {isExpanded ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div style={{ padding: "0 20px 20px", borderTop: "1px solid rgba(139,92,246,0.08)" }}>
                    {req.message && (
                      <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(139,92,246,0.06)" }}>
                        <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>
                          <span style={{ fontWeight: 700, color: "#8b5cf6" }}>User note: </span>{req.message}
                        </p>
                      </div>
                    )}

                    {req.entitlement_code && (
                      <p style={{ marginTop: 10, fontSize: 11, color: "#9ca3af" }}>
                        Entitlement: <code style={{ background: "rgba(139,92,246,0.08)", padding: "1px 6px", borderRadius: 4 }}>{req.entitlement_code}</code>
                      </p>
                    )}

                    {req.status === "pending" && (
                      <>
                        <textarea
                          placeholder="Admin note (optional)"
                          value={notes[req.id] ?? ""}
                          onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                          style={{
                            width: "100%", marginTop: 14, padding: "10px 12px", borderRadius: 10, border: "1.5px solid rgba(139,92,246,0.2)",
                            background: "rgba(255,255,255,0.8)", fontSize: 12, resize: "vertical", minHeight: 60, outline: "none",
                            fontFamily: "inherit", color: "#374151", boxSizing: "border-box",
                          }}
                        />
                        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                          <button
                            onClick={() => approve.mutate({ id: req.id })}
                            disabled={approve.isPending}
                            style={{
                              flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                              background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", fontSize: 13, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            }}
                          >
                            <CheckCircle2 size={14} /> Approve & Activate
                          </button>
                          <button
                            onClick={() => reject.mutate({ id: req.id })}
                            disabled={reject.isPending}
                            style={{
                              flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                              color: "#ef4444", fontSize: 13, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            } as React.CSSProperties}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </>
                    )}

                    {req.status !== "pending" && req.admin_note && (
                      <p style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
                        <span style={{ fontWeight: 700 }}>Admin note: </span>{req.admin_note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
