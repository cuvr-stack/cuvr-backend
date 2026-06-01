import { useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, LayoutDashboard, Upload, CheckCircle2,
  AlertCircle, Loader2, Eye, Trash2, RefreshCw, Paintbrush,
} from "lucide-react";
import { api } from "@/lib/api";
import FloorPlanViewer from "@/components/ui/FloorPlanViewer";
import { tilt } from "@/lib/tilt";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FloorPlan {
  id: string;
  property_id: string;
  filename: string;
  original_url: string;
  status: "pending" | "parsing" | "building" | "texturing" | "ready" | "failed";
  progress: number;
  error_message?: string;
  glb_url?: string;
  nav_nodes?: NavNode[];
  created_at: string;
}

interface NavNode {
  nodeId: string;
  roomId: string;
  label: string;
  textureUrl: string;
  panoramaUrl?: string;
}

interface PendingFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  floorPlanId?: string;
}

// ── Stage labels & colours ─────────────────────────────────────────────────────

const STAGE: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Queued",              color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  parsing:   { label: "🤖 Reading rooms…",   color: "#3b82f6", bg: "rgba(59,130,246,0.12)"  },
  building:  { label: "🏗️ Building 3D…",    color: "#a855f7", bg: "rgba(168,85,247,0.12)"  },
  texturing: { label: "🎨 AI Textures…",     color: "#ec4899", bg: "rgba(236,72,153,0.12)"  },
  ready:     { label: "✅ Ready",             color: "#22c55e", bg: "rgba(34,197,94,0.12)"   },
  failed:    { label: "❌ Failed",            color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
};

const glass = {
  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid transparent",
  borderRadius: 20,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloorPlanUploadPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pending, setPending]   = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewerFp, setViewerFp]   = useState<FloorPlan | null>(null);

  // ── Existing floor plans ───────────────────────────────────────────────────

  const { data: floorPlans = [], refetch } = useQuery<FloorPlan[]>({
    queryKey: ["floor-plans", propertyId],
    queryFn: () =>
      api.get(`/api/properties/${propertyId}/floor-plans`).then((r) => r.data),
    refetchInterval: (query) => {
      const data = (query as any)?.state?.data ?? (query as any) ?? [];
      const active = Array.isArray(data) && data.some(
        (fp: FloorPlan) => !["ready", "failed"].includes(fp.status)
      );
      return active ? 3000 : false;
    },
  });

  // ── Dropzone ───────────────────────────────────────────────────────────────

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: PendingFile[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      progress: 0,
    }));
    setPending((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"] },
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  });

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadAll = async () => {
    setUploading(true);
    for (const pf of pending.filter((p) => p.status === "pending")) {
      setPending((prev) =>
        prev.map((p) => (p.id === pf.id ? { ...p, status: "uploading" } : p))
      );
      try {
        const form = new FormData();
        form.append("file", pf.file);
        const res = await api.post(
          `/api/properties/${propertyId}/floor-plans`,
          form,
          {
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress: (e) => {
              const progress = Math.round((e.loaded * 100) / (e.total ?? 1));
              setPending((prev) =>
                prev.map((p) => (p.id === pf.id ? { ...p, progress } : p))
              );
            },
          }
        );
        setPending((prev) =>
          prev.map((p) =>
            p.id === pf.id
              ? { ...p, status: "done", progress: 100, floorPlanId: res.data.id }
              : p
          )
        );
        qc.invalidateQueries({ queryKey: ["floor-plans", propertyId] });
      } catch (err: any) {
        setPending((prev) =>
          prev.map((p) =>
            p.id === pf.id
              ? { ...p, status: "error", error: err?.response?.data?.detail ?? "Upload failed" }
              : p
          )
        );
      }
    }
    setUploading(false);
  };

  const deleteFloorPlan = async (fpId: string) => {
    await api.delete(`/api/floor-plans/${fpId}`);
    qc.invalidateQueries({ queryKey: ["floor-plans", propertyId] });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* 3D Viewer modal */}
      {viewerFp && viewerFp.glb_url && (
        <FloorPlanViewer
          glbUrl={viewerFp.glb_url}
          filename={viewerFp.filename}
          navNodes={viewerFp.nav_nodes ?? []}
          onClose={() => setViewerFp(null)}
          onSketchRender={(roomImageUrl, roomLabel) => {
            setViewerFp(null);
            navigate(
              `/dashboard/properties/${propertyId}/sketch-render`,
              {
                state: {
                  floorPlanImageUrl: roomImageUrl || viewerFp.original_url,
                  floorPlanFilename: roomLabel ? `${roomLabel}.jpg` : viewerFp.filename,
                }
              }
            );
          }}
        />
      )}

      <div style={{ animation: "fadeIn 0.22s ease-out" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <Link to={`/dashboard/properties/${propertyId}`} style={{
            width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.7)", border: "1.5px solid transparent",
            color: "#6b7280", textDecoration: "none", backdropFilter: "blur(12px)",
          }}
            onMouseEnter={e => { e.currentTarget.style.color = "#8b5cf6"; e.currentTarget.style.background = "rgba(139,92,246,0.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.background = "rgba(255,255,255,0.7)"; }}
          >
            <ArrowLeft size={14} />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
            }}>
              <LayoutDashboard size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.3, background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Floor Plan → 3D Walkthrough
              </h1>
              <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>
                Upload a 2D architectural drawing — AI converts it to a realistic 3D walkthrough
              </p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── How it works ── */}
          <div style={{ ...glass, padding: "18px 24px" }} {...tilt}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#8b5cf6", textTransform: "uppercase", margin: "0 0 16px" }}>
              How it works
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, textAlign: "center" }}>
              {[
                { icon: "📐", label: "Upload floor plan JPG / PNG" },
                { icon: "🤖", label: "Claude Vision reads rooms & dimensions" },
                { icon: "🏗️", label: "3D geometry built (walls, floors, ceilings)" },
                { icon: "🎨", label: "FLUX AI applies photorealistic textures" },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, background: "rgba(139,92,246,0.08)",
                  }}>
                    {s.icon}
                  </div>
                  <span style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Drop zone ── */}
          <div {...getRootProps()} style={{
            ...glass,
            padding: 40, textAlign: "center", cursor: "pointer",
            border: isDragActive ? "2px dashed #8b5cf6" : "1px solid rgba(255,255,255,0.85)",
            background: isDragActive ? "rgba(139,92,246,0.06)" : "rgba(255,255,255,0.65)",
            transition: "all 0.2s",
          }}>
            <input {...getInputProps()} />
            <div style={{
              width: 56, height: 56, borderRadius: 18, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center",
              background: isDragActive ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.08)",
            }}>
              <Upload size={24} color={isDragActive ? "#8b5cf6" : "#a78bfa"} />
            </div>
            <p style={{ fontWeight: 700, fontSize: 15, color: "#1a1d2e", margin: "0 0 6px" }}>
              {isDragActive ? "Drop it here!" : "Drag & drop your floor plan"}
            </p>
            <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>
              JPG, PNG, WebP, TIFF · Max 50 MB
            </p>
          </div>

          {/* ── Pending files ── */}
          {pending.length > 0 && (
            <div style={{ ...glass, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {pending.map((pf) => (
                <div key={pf.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, overflow: "hidden", flexShrink: 0,
                    background: "rgba(139,92,246,0.08)",
                  }}>
                    <img src={URL.createObjectURL(pf.file)} alt={pf.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1d2e", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pf.file.name}
                    </p>
                    {pf.status === "uploading" && (
                      <div style={{ height: 4, borderRadius: 4, background: "rgba(139,92,246,0.15)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pf.progress}%`, background: "linear-gradient(135deg,#8b5cf6,#ec4899)", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                    )}
                    {pf.status === "error" && (
                      <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{pf.error}</p>
                    )}
                  </div>
                  {pf.status === "pending"   && <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(139,92,246,0.2)" }} />}
                  {pf.status === "uploading" && <Loader2 size={16} color="#8b5cf6" className="animate-spin" />}
                  {pf.status === "done"      && <CheckCircle2 size={16} color="#22c55e" />}
                  {pf.status === "error"     && <AlertCircle  size={16} color="#ef4444" />}
                </div>
              ))}

              {pending.some((p) => p.status === "pending") && (
                <button onClick={uploadAll} disabled={uploading} style={{
                  width: "100%", marginTop: 4, padding: "11px 0", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer",
                  opacity: uploading ? 0.6 : 1, transition: "opacity 0.2s",
                  boxShadow: "0 4px 16px rgba(139,92,246,0.3)",
                }}>
                  {uploading ? "Uploading…" : "Upload & Process"}
                </button>
              )}
            </div>
          )}

          {/* ── Existing floor plans ── */}
          {floorPlans.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1a1d2e", margin: 0 }}>
                  Floor Plans ({floorPlans.length})
                </p>
                <button onClick={() => refetch()} style={{
                  padding: 6, borderRadius: 8, border: "none", background: "transparent",
                  cursor: "pointer", color: "#9ca3af",
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#8b5cf6")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {floorPlans.map((fp) => {
                  const stage = STAGE[fp.status] ?? STAGE.pending;
                  const isProcessing = !["ready", "failed"].includes(fp.status);

                  return (
                    <div key={fp.id} style={{ ...glass, padding: 16 }} {...tilt}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {/* Thumbnail */}
                        <div style={{
                          width: 56, height: 56, borderRadius: 14, overflow: "hidden", flexShrink: 0,
                          background: "rgba(139,92,246,0.08)",
                        }}>
                          <img src={fp.original_url} alt={fp.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1d2e", margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {fp.filename}
                          </p>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                              background: stage.bg, color: stage.color,
                            }}>
                              {isProcessing && <Loader2 size={10} className="animate-spin" />}
                              {stage.label}
                            </span>
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>{fp.progress}%</span>
                          </div>

                          {isProcessing && (
                            <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: "rgba(139,92,246,0.1)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${fp.progress}%`, background: stage.color, borderRadius: 4, transition: "width 0.5s" }} />
                            </div>
                          )}

                          {fp.status === "ready" && fp.nav_nodes && (
                            <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0" }}>
                              {fp.nav_nodes.length} rooms · Ready to explore
                            </p>
                          )}
                          {fp.error_message && (
                            <p style={{ fontSize: 11, color: "#ef4444", margin: "4px 0 0" }}>{fp.error_message}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {fp.status === "ready" && fp.glb_url && (
                            <>
                              <button onClick={() => setViewerFp(fp)} style={{
                                width: 34, height: 34, borderRadius: 10, border: "none", cursor: "pointer",
                                background: "rgba(139,92,246,0.1)", color: "#8b5cf6",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                                title="View 3D model"
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.2)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "rgba(139,92,246,0.1)")}
                              >
                                <Eye size={15} />
                              </button>

                              <button onClick={() => navigate(
                                `/dashboard/properties/${propertyId}/sketch-render`,
                                { state: { floorPlanImageUrl: fp.original_url, floorPlanFilename: fp.filename } }
                              )} style={{
                                width: 34, height: 34, borderRadius: 10, border: "none", cursor: "pointer",
                                background: "rgba(236,72,153,0.1)", color: "#ec4899",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                                title="Sketch Render"
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(236,72,153,0.2)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "rgba(236,72,153,0.1)")}
                              >
                                <Paintbrush size={15} />
                              </button>
                            </>
                          )}
                          <button onClick={() => deleteFloorPlan(fp.id)} style={{
                            width: 34, height: 34, borderRadius: 10, border: "none", cursor: "pointer",
                            background: "rgba(239,68,68,0.06)", color: "#d1d5db",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                            title="Delete"
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#ef4444"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; e.currentTarget.style.color = "#d1d5db"; }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
