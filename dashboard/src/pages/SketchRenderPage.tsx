import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft, PenTool, Loader2, CheckCircle2, Sparkles,
  Home, Building2, X, Plus, ChevronDown, Info, Share2,
  Monitor, Layers, Cpu, RefreshCw, Clock, Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/utils";

// ── Design tokens (light glassmorphism) ──────────────────────────────────────
const GREEN     = "#8b5cf6";
const BG_PANEL  = "rgba(255,255,255,0.65)";
const BG_CARD   = "rgba(255,255,255,0.8)";
const BG_DEEP   = "rgba(249,250,255,0.9)";
const BORDER    = "rgba(255,255,255,0.85)";
const T1        = "#1a1d2e";
const T2        = "#374151";
const T3        = "#9ca3af";
const GLASS_STYLE = {
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

// ── Data ──────────────────────────────────────────────────────────────────────
const STYLE_PRESETS = [
  { id: "modern minimalist",      label: "Modern",         Icon: Monitor },
  { id: "mediterranean villa",    label: "Mediterranean",  Icon: Layers  },
  { id: "scandinavian nordic",    label: "Scandinavian",   Icon: Cpu     },
  { id: "contemporary luxury",    label: "Luxury",         Icon: Sparkles },
  { id: "arabic islamic",         label: "Arabic",         Icon: Wand2   },
  { id: "industrial modern",      label: "Industrial",     Icon: Building2 },
];

const INTERIOR_STYLES = [
  { id: "modern luxury interior",        label: "Modern Luxury",  Icon: Monitor  },
  { id: "scandinavian minimal interior", label: "Scandinavian",   Icon: Cpu      },
  { id: "classic traditional interior",  label: "Classic",        Icon: Layers   },
  { id: "arabic oriental interior",      label: "Arabic",         Icon: Wand2    },
  { id: "minimalist zen interior",       label: "Minimalist",     Icon: Home     },
  { id: "industrial loft interior",      label: "Industrial",     Icon: Building2 },
];

const INTERIOR_ROOMS  = ["Living Room", "Bedroom", "Kitchen", "Bathroom", "Office", "Dining Room"];
const VIEW_LABELS     = ["Front View", "Left Side", "Right Side", "Back View", "Top View", "Detail View"];

const STYLE_INFO: Record<string, string> = {
  "modern minimalist":              "Clean lines, neutral tones and open spaces. Focuses on function over ornamentation with high-contrast glass and steel facades.",
  "mediterranean villa":            "Warm terracotta, stucco walls and arched openings inspired by southern European coastal architecture.",
  "scandinavian nordic":            "Light wood, white surfaces and cosy textures. Emphasises natural light, simplicity and warmth.",
  "contemporary luxury":            "Bold forms, premium materials and dramatic lighting. Blends glass, stone and high-end finishes.",
  "arabic islamic":                 "Intricate geometric patterns, mashrabiya screens and ornate arches rooted in Islamic architectural tradition.",
  "industrial modern":              "Exposed concrete, steel beams and raw brick. Urban aesthetic with a functional, workshop-inspired palette.",
  "modern luxury interior":         "Opulent finishes — marble, gold accents, bespoke lighting — balanced with contemporary spatial planning.",
  "scandinavian minimal interior":  "Muted palette, natural materials and clutter-free layouts that prioritise comfort and calm.",
  "classic traditional interior":   "Symmetrical layouts, moulded ceilings and rich wood tones evoking timeless European elegance.",
  "arabic oriental interior":       "Deep jewel tones, carved woodwork and layered textiles inspired by Levantine and Gulf interiors.",
  "minimalist zen interior":        "Stone, bamboo and neutral hues create a meditative, uncluttered atmosphere rooted in Japanese Wabi-sabi.",
  "industrial loft interior":       "Open-plan with exposed ducts, concrete floors and Edison lighting for a raw, creative-studio feel.",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type UploadedImage = { file: File; preview: string };
type AppStatus     = "idle" | "uploading" | "queued" | "error";

interface HistoryItem {
  id: string; photo_id: string; room_label: string | null;
  original_url: string | null; status: string; variation_url: string | null;
  style: string; color: string; prompt: string; ai_model: string; created_at: string;
}

// ── Slider sub-component ──────────────────────────────────────────────────────
function Slider({ label, value, onChange, min = 0, max = 100 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: T2 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>{value}%</span>
      </div>
      <div style={{ position: "relative", height: 3, borderRadius: 4, background: "rgba(139,92,246,0.12)" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${((value - min) / (max - min)) * 100}%`,
          background: "linear-gradient(90deg,#8b5cf6,#ec4899)", borderRadius: 4,
        }} />
        <input type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", height: "100%", margin: 0 }}
        />
        <div style={{
          position: "absolute", top: "50%",
          left: `${((value - min) / (max - min)) * 100}%`,
          transform: "translate(-50%, -50%)",
          width: 12, height: 12, borderRadius: "50%",
          background: GREEN,
          boxShadow: `0 0 0 3px rgba(139,92,246,0.25)`,
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SketchRenderPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const location = useLocation();
  const navState = location.state as { floorPlanImageUrl?: string; floorPlanFilename?: string } | null;

  const [images, setImages]               = useState<UploadedImage[]>([]);
  const [sketchType, setSketchType]       = useState<"exterior" | "interior">("exterior");
  const [selectedStyle, setSelectedStyle] = useState("modern minimalist");
  const [selectedRoom, setSelectedRoom]   = useState("living room");
  const [prompt, setPrompt]               = useState("");
  const [imageStrength, setImageStrength] = useState(85);
  const [styleStrength, setStyleStrength] = useState(42);
  const [detailLevel, setDetailLevel]     = useState(12);
  const [appStatus, setAppStatus]         = useState<AppStatus>("idle");
  const [error, setError]                 = useState<string | null>(null);
  const [showRoomDrop, setShowRoomDrop]   = useState(false);
  const [showStyleInfo, setShowStyleInfo] = useState(false);
  const [history, setHistory]             = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [syncActive, setSyncActive]       = useState(false);
  const pollRef                           = useRef<ReturnType<typeof setInterval> | null>(null);

  const styles = sketchType === "exterior" ? STYLE_PRESETS : INTERIOR_STYLES;
  const mode: "render" | "3d" = images.length >= 2 ? "3d" : "render";

  // ── History polling ───────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await api.get(`/api/ai/properties/${propertyId}/variations`);
      setHistory(res.data.items ?? []);
      const hasProcessing = (res.data.items ?? []).some(
        (v: HistoryItem) => v.status === "pending" || v.status === "processing"
      );
      setSyncActive(hasProcessing);
    } catch { /* silent */ }
    finally { setHistoryLoading(false); }
  }, [propertyId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useEffect(() => {
    if (syncActive) { pollRef.current = setInterval(fetchHistory, 4000); }
    else { if (pollRef.current) clearInterval(pollRef.current); }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [syncActive, fetchHistory]);

  // ── Auto-load floor plan image passed via navigation state ────────────────
  useEffect(() => {
    if (!navState?.floorPlanImageUrl) return;
    const url = navState.floorPlanImageUrl;
    const filename = navState.floorPlanFilename ?? "floor-plan.jpg";

    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
        const preview = URL.createObjectURL(blob);
        setImages([{ file, preview }]);
        setSketchType("interior"); // floor plans are interior sketches
      })
      .catch(() => {
        // If CORS blocks the fetch, fall back to a preview-only entry
        setImages([{ file: new File([], filename), preview: url }]);
        setSketchType("interior");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dropzone ──────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    const newImgs = accepted.slice(0, 6 - images.length).map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setImages(prev => [...prev, ...newImgs].slice(0, 6));
    setAppStatus("idle"); setError(null);
  }, [images]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxSize: 50 * 1024 * 1024, multiple: true, disabled: images.length >= 6,
  });

  const removeImage = (index: number) => {
    setImages(prev => { const next = [...prev]; URL.revokeObjectURL(next[index].preview); next.splice(index, 1); return next; });
    setAppStatus("idle");
  };

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (images.length === 0) return;
    setAppStatus("uploading"); setError(null);
    try {
      const photoIds: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const { file } = images[i];
        const label = mode === "3d" ? VIEW_LABELS[i]
          : sketchType === "exterior" ? "exterior sketch" : `${selectedRoom} sketch`;
        const formData = new FormData();
        formData.append("file", file);
        formData.append("room_label", label);
        formData.append("skip_process", "true");
        const res = await api.post(`/api/properties/${propertyId}/photos`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        photoIds.push(res.data.id);
      }
      const roomPayload = sketchType === "exterior" ? "exterior building" : selectedRoom;
      if (mode === "render") {
        await api.post(`/api/ai/photos/${photoIds[0]}/render-sketch`, {
          style: selectedStyle, room_type: roomPayload, prompt: prompt.trim() || undefined,
        });
      } else {
        await api.post(`/api/ai/properties/${propertyId}/generate-3d`, {
          photo_ids: photoIds, style: selectedStyle, room_type: roomPayload,
        });
      }
      setAppStatus("queued"); setSyncActive(true); fetchHistory();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Something went wrong");
      setAppStatus("error");
    }
  };

  const isGenerating = appStatus === "uploading" || appStatus === "queued";
  const canGenerate  = images.length > 0 && !isGenerating;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 80px)" }}>

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT COLUMN — AI Visualizer
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Left column header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 48, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              to={`/dashboard/properties/${propertyId}`}
              style={{
                width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                border: BORDER, background: "transparent", color: T2, textDecoration: "none", flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,230,118,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <ArrowLeft size={14} />
            </Link>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.3, background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                AI Visualizer
              </h1>
              <p style={{ fontSize: 12, fontWeight: 700, margin: 0, letterSpacing: 0.8, textTransform: "uppercase", color: "#8b5cf6" }}>
                {sketchType === "exterior" ? "Exterior Rendering" : "Interior Staging"} &nbsp;·&nbsp; {mode === "3d" ? "3D Mode" : "Render Mode"}
              </p>
            </div>
          </div>

          {/* 4K Preview + Export */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { icon: Monitor, label: "4K Preview" },
              { icon: Share2,  label: "Export"     },
            ].map(({ icon: Icon, label }) => (
              <button key={label} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 8,
                border: `1px solid rgba(255,255,255,0.12)`,
                background: BG_CARD, color: T2, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
                onMouseEnter={e => { e.currentTarget.style.color = T1; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = T2; e.currentTarget.style.background = BG_CARD; }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Canvas — Visualise Your Vision ── */}
        <div style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          background: BG_PANEL, borderRadius: 20, border: BORDER, overflow: "hidden",
          ...GLASS_STYLE,
        }}>
          {/* Canvas content */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {images.length === 0 ? (
              /* ── Upload / Welcome state ── */
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 20, padding: 40,
              }}>
                {/* Grid pattern */}
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: "linear-gradient(rgba(0,230,118,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,230,118,0.04) 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                }} />

                <div style={{ position: "relative", zIndex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                  <div style={{
                    width: 68, height: 68, borderRadius: 18,
                    background: "rgba(0,230,118,0.08)", border: `1px solid rgba(0,230,118,0.2)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <PenTool size={28} color={GREEN} />
                  </div>
                  <div>
                    <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: "0 0 10px", letterSpacing: -0.3 }}>
                      Visualise Your Vision
                    </p>
                    <p style={{ color: T2, fontSize: 13, margin: 0, lineHeight: 1.7, maxWidth: 360 }}>
                      Upload a sketch or floor plan. Select your architectural style from the right panel and hit Render Scene.
                    </p>
                  </div>

                  <div {...getRootProps()} style={{
                    padding: "12px 28px", borderRadius: 10, cursor: "pointer",
                    background: isDragActive ? "linear-gradient(135deg,#8b5cf6,#ec4899)" : "transparent",
                    border: `1.5px solid ${isDragActive ? "#8b5cf6" : "rgba(139,92,246,0.3)"}`,
                    display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
                  }}>
                    <input {...getInputProps()} />
                    <Plus size={16} color={isDragActive ? "#fff" : GREEN} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: isDragActive ? "#fff" : GREEN }}>
                      {isDragActive ? "Drop to upload" : "Browse files or drag & drop"}
                    </span>
                  </div>
                  <p style={{ color: T3, fontSize: 13, margin: 0 }}>
                    JPG · PNG · WebP · up to 50 MB &nbsp;·&nbsp; 1 image → 2D render &nbsp;·&nbsp; 2–6 images → 3D
                  </p>
                </div>
              </div>
            ) : (
              /* ── Image grid ── */
              <div style={{ padding: 20, height: "100%", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: T3, textTransform: "uppercase" }}>
                    {mode === "3d" ? "Multi-view" : "Sketch"} ({images.length}/6)
                  </span>
                  {images.length < 6 && (
                    <span style={{ fontSize: 13, color: T3 }}>Add {VIEW_LABELS[images.length]}</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {images.map((img, i) => (
                    <div key={i} style={{
                      position: "relative", borderRadius: 10, overflow: "hidden",
                      aspectRatio: "16/9", border: BORDER,
                    }}>
                      <img src={img.preview} alt={VIEW_LABELS[i]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 8px", background: "rgba(0,0,0,0.7)", fontSize: 9, color: "rgba(255,255,255,0.8)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
                        {VIEW_LABELS[i]}
                      </div>
                      <button onClick={() => removeImage(i)} style={{
                        position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%",
                        border: "none", background: "rgba(239,68,68,0.9)", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <X size={11} color="white" />
                      </button>
                    </div>
                  ))}
                  {images.length < 6 && (
                    <div {...getRootProps()} style={{
                      borderRadius: 10, cursor: "pointer", aspectRatio: "16/9",
                      border: `2px dashed ${isDragActive ? GREEN : "rgba(255,255,255,0.1)"}`,
                      background: isDragActive ? "rgba(0,230,118,0.06)" : "rgba(255,255,255,0.02)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                    }}>
                      <input {...getInputProps()} />
                      <Plus size={16} color={T3} />
                      <p style={{ color: T3, fontSize: 12, margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {VIEW_LABELS[images.length]}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BEFORE / AFTER labels at bottom corners */}
            {images.length > 0 && (
              <>
                <div style={{ position: "absolute", bottom: 12, left: 12, padding: "5px 10px", background: "rgba(0,0,0,0.65)", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)", letterSpacing: 1 }}>
                  BEFORE: RAW SKETCH
                </div>
                {history.some(v => v.status === "completed") && (
                  <div style={{ position: "absolute", bottom: 12, right: 12, padding: "5px 10px", background: "rgba(0,230,118,0.15)", border: `1px solid rgba(0,230,118,0.3)`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: 1 }}>
                    AFTER: AI ENHANCED
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sketch type toggle strip */}
          <div style={{
            borderTop: BORDER, padding: "12px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: BG_DEEP, flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { id: "exterior", label: "Exterior", icon: Building2 },
                { id: "interior", label: "Interior",  icon: Home },
              ].map(t => {
                const Icon = t.icon;
                const active = sketchType === t.id;
                return (
                  <button key={t.id} onClick={() => {
                    setSketchType(t.id as "exterior" | "interior");
                    setSelectedStyle(t.id === "exterior" ? "modern minimalist" : "modern luxury interior");
                  }} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontWeight: 600, fontSize: 12,
                    background: active ? "rgba(139,92,246,0.12)" : "transparent",
                    outline: active ? `1px solid rgba(139,92,246,0.4)` : `1px solid transparent`,
                    color: active ? GREEN : T3, transition: "all 0.15s",
                  }}>
                    <Icon size={13} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Status pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {sketchType === "interior" && (
                <div style={{ position: "relative" }}>
                  <button onClick={() => setShowRoomDrop(!showRoomDrop)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${BORDER}`,
                    background: "rgba(255,255,255,0.04)", color: T2, fontSize: 12, fontWeight: 500,
                  }}>
                    {selectedRoom.charAt(0).toUpperCase() + selectedRoom.slice(1)}
                    <ChevronDown size={12} color={T3} style={{ transform: showRoomDrop ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </button>
                  {showRoomDrop && (
                    <div style={{
                      position: "absolute", bottom: "100%", left: 0, marginBottom: 4, zIndex: 30,
                      background: "rgba(255,255,255,0.95)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 10,
                      overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", minWidth: 140,
                    }}>
                      {INTERIOR_ROOMS.map(r => (
                        <button key={r} onClick={() => { setSelectedRoom(r.toLowerCase()); setShowRoomDrop(false); }} style={{
                          width: "100%", textAlign: "left", padding: "9px 14px", border: "none",
                          cursor: "pointer", fontSize: 12, color: selectedRoom === r.toLowerCase() ? GREEN : T2,
                          background: selectedRoom === r.toLowerCase() ? "rgba(0,230,118,0.08)" : "transparent",
                        }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={e => (e.currentTarget.style.background = selectedRoom === r.toLowerCase() ? "rgba(0,230,118,0.08)" : "transparent")}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isGenerating
                  ? <Loader2 size={11} color={GREEN} className="animate-spin" />
                  : <span style={{ width: 7, height: 7, borderRadius: "50%", background: appStatus === "error" ? "#ef4444" : images.length > 0 ? GREEN : T3, boxShadow: appStatus !== "error" && images.length > 0 ? `0 0 5px ${GREEN}` : "none", display: "inline-block" }} />
                }
                <span style={{ fontSize: 13, fontWeight: 700, color: T2, letterSpacing: 0.5 }}>
                  {appStatus === "uploading" ? "UPLOADING…" : appStatus === "queued" ? "AI RENDERING…" : appStatus === "error" ? "ERROR" : images.length > 0 ? "READY" : "MODEL READY"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 16,
          background: BG_PANEL, borderRadius: 20, border: BORDER,
          padding: "12px 20px", ...GLASS_STYLE,
        }}>
          {/* Latency */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Cpu size={14} color={GREEN} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, color: T3, textTransform: "uppercase", margin: 0 }}>Latency</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: GREEN, margin: 0, lineHeight: 1.2 }}>
                {isGenerating ? "…" : "24ms"}
              </p>
            </div>
          </div>

          <div style={{ width: 1, height: 32, background: BORDER }} />

          {/* GPU Load */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Layers size={14} color={GREEN} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, color: T3, textTransform: "uppercase", margin: 0 }}>GPU Load</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: GREEN, margin: 0, lineHeight: 1.2 }}>
                {isGenerating ? "98%" : "68%"}
              </p>
            </div>
          </div>

          <div style={{ width: 1, height: 32, background: BORDER }} />

          {/* Sync Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RefreshCw size={14} color={GREEN} className={syncActive ? "animate-spin" : ""} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, color: T3, textTransform: "uppercase", margin: 0 }}>Sync Status</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: syncActive ? GREEN : T1, margin: 0, lineHeight: 1.2 }}>
                {syncActive ? "Syncing" : "Stable"}
              </p>
            </div>
          </div>

          {/* Generation history strip */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={11} color={T3} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T3, letterSpacing: 0.5 }}>HISTORY</span>
              {syncActive && <RefreshCw size={10} color={GREEN} className="animate-spin" />}
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              {historyLoading ? (
                [1, 2, 3].map(i => (
                  <div key={i} style={{ width: 52, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.05)" }} />
                ))
              ) : history.length === 0 ? (
                <span style={{ fontSize: 13, color: T3 }}>No renders yet</span>
              ) : (
                history.slice(0, 5).map(v => {
                  const isPending = v.status === "pending" || v.status === "processing";
                  const imgUrl = v.variation_url ? assetUrl(v.variation_url) : v.original_url ? assetUrl(v.original_url) : null;
                  return (
                    <div key={v.id} style={{
                      width: 52, height: 36, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                      border: isPending ? `1px solid rgba(0,230,118,0.3)` : BORDER,
                      position: "relative", cursor: "pointer",
                    }}>
                      {imgUrl ? (
                        <img src={imgUrl} alt={v.style} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isPending ? 0.4 : 1 }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "rgba(0,230,118,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <PenTool size={12} color="rgba(0,230,118,0.3)" />
                        </div>
                      )}
                      {isPending && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
                          <Loader2 size={12} color={GREEN} className="animate-spin" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {!historyLoading && history.length > 0 && (
                <Link to={`/dashboard/properties/${propertyId}`} style={{ fontSize: 13, fontWeight: 600, color: GREEN, textDecoration: "none", display: "flex", alignItems: "center" }}>
                  View all →
                </Link>
              )}
            </div>
          </div>

          {/* Powered by */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 10, borderLeft: BORDER }}>
            <Wand2 size={11} color={T3} />
            <span style={{ fontSize: 12, color: T3, letterSpacing: 0.3 }}>Powered by FLUX · ControlNet</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT COLUMN — Architectural Style
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Right column header — same height as left column header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 48, flexShrink: 0,
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: T1, letterSpacing: -0.2 }}>
            Architectural Style
          </span>
          <button
            onClick={() => setShowStyleInfo(v => !v)}
            title="About architectural styles"
            style={{
              width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: showStyleInfo ? "rgba(0,230,118,0.15)" : "rgba(255,255,255,0.06)",
              color: showStyleInfo ? GREEN : T3,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!showStyleInfo) { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = T1; } }}
            onMouseLeave={e => { if (!showStyleInfo) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = T3; } }}
          >
            <Info size={14} />
          </button>
        </div>

        {/* ── Style Info Panel (toggled by Info button) ── */}
        {showStyleInfo && (
          <div style={{
            flexShrink: 0, borderRadius: 12, padding: "14px 16px",
            background: "rgba(139,92,246,0.06)", border: `1px solid rgba(139,92,246,0.2)`,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Sparkles size={13} color={GREEN} />
                <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>
                  {styles.find(s => s.id === selectedStyle)?.label ?? "Style"} Selected
                </span>
              </div>
              <button
                onClick={() => setShowStyleInfo(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T3, padding: 0, lineHeight: 1 }}
              >
                <X size={13} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: T2, lineHeight: 1.65, margin: 0 }}>
              {STYLE_INFO[selectedStyle] ?? "Select a style to see its description."}
            </p>
            <p style={{ fontSize: 12, color: T3, marginTop: 10, marginBottom: 0 }}>
              Tip: Switch styles anytime — the AI re-renders with the new look.
            </p>
          </div>
        )}

        {/* ── Right panel — cards flush to top, no top padding ── */}
        <div style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          background: BG_PANEL, borderRadius: 20, border: BORDER, overflow: "hidden",
          ...GLASS_STYLE,
        }}>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

            {/* Style cards — first card has no top border, NO border-radius */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {styles.map((s, idx) => {
                const active = selectedStyle === s.id;
                const Icon = s.Icon;
                return (
                  <button key={s.id} onClick={() => setSelectedStyle(s.id)} style={{
                    display: "flex", alignItems: "center", gap: 13,
                    padding: "13px 16px",
                    borderRadius: 0,
                    border: "none",
                    borderTop: idx === 0 ? "none" : `1px solid ${active ? "transparent" : BORDER}`,
                    borderLeft: active ? `3px solid ${GREEN}` : "3px solid transparent",
                    background: active ? "rgba(139,92,246,0.08)" : "transparent",
                    cursor: "pointer", transition: "all 0.15s", textAlign: "left", width: "100%",
                  }}
                    onMouseEnter={e => !active && (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                    onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: active ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={16} color={active ? GREEN : T2} />
                    </div>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: active ? 700 : 500, color: active ? T1 : T1 }}>
                      {s.label}
                    </span>
                    {/* Radio */}
                    <div style={{
                      width: 17, height: 17, borderRadius: "50%", flexShrink: 0,
                      border: active ? `2.5px solid ${GREEN}` : `2px solid ${T3}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN }} />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── MATERIAL TUNING ── */}
            <div style={{ padding: "14px 16px 12px", borderTop: BORDER, borderBottom: BORDER }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: T3, textTransform: "uppercase", marginBottom: 16 }}>
                Material Tuning
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Slider label="Reflection Strength" value={imageStrength} onChange={setImageStrength} />
                <Slider label="Glass Translucency"  value={styleStrength}  onChange={setStyleStrength} />
                <Slider label="Emission Glow"        value={detailLevel}    onChange={setDetailLevel} />
              </div>
            </div>

            {/* ── SCENE DESCRIPTION ── */}
            <div style={{ padding: "14px 16px 12px", borderBottom: BORDER }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: T3, textTransform: "uppercase", marginBottom: 10 }}>
                Scene Description
              </p>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Luxurious facade with floor-to-ceiling glass…"
                rows={2}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.7)",
                  border: `1px solid rgba(139,92,246,0.15)`, borderRadius: 8,
                  padding: "8px 10px", color: T1, fontSize: 12, resize: "none",
                  outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(139,92,246,0.4)")}
                onBlur={e => (e.currentTarget.style.borderColor = "rgba(139,92,246,0.15)")}
              />
            </div>

            {/* ── AI OPTIMIZER ── */}
            <div style={{ padding: "14px 16px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Sparkles size={13} color={GREEN} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T1 }}>AI Optimizer</span>
              </div>
              <p style={{ fontSize: 13, color: T2, lineHeight: 1.6, margin: "0 0 10px" }}>
                {isGenerating
                  ? "Adaptive sampling active. Light bounces calculated in real-time."
                  : images.length > 0
                  ? "Model ready. Parameters locked and optimised for render."
                  : "Upload a sketch to activate the AI render pipeline."}
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 0.7, 0.4].map((opacity, i) => (
                  <div key={i} style={{
                    flex: 1, height: 3, borderRadius: 4,
                    background: isGenerating
                      ? `rgba(0,230,118,${opacity})`
                      : images.length > 0 ? `rgba(0,230,118,${opacity * 0.6})` : "rgba(255,255,255,0.08)",
                    transition: "background 0.5s",
                  }} />
                ))}
              </div>
            </div>
          </div>

          {/* ── RENDER SCENE — always pinned at bottom ── */}
          <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(139,92,246,0.1)", flexShrink: 0, background: BG_DEEP }}>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
                cursor: canGenerate ? "pointer" : "not-allowed",
                background: canGenerate ? "linear-gradient(135deg,#8b5cf6,#ec4899)" : "rgba(139,92,246,0.15)",
                color: canGenerate ? "#fff" : T3,
                fontWeight: 800, fontSize: 13, letterSpacing: 0.8,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: canGenerate ? "0 4px 20px rgba(139,92,246,0.35)" : "none",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => canGenerate && (e.currentTarget.style.opacity = "0.87")}
              onMouseLeave={e => canGenerate && (e.currentTarget.style.opacity = "1")}
            >
              {appStatus === "uploading" ? (
                <><Loader2 size={15} className="animate-spin" /> Uploading…</>
              ) : appStatus === "queued" ? (
                <><Loader2 size={15} className="animate-spin" /> AI Rendering…</>
              ) : (
                <><Sparkles size={15} /> RENDER SCENE</>
              )}
            </button>
            {error && <p style={{ fontSize: 13, color: "#ef4444", textAlign: "center", margin: "8px 0 0" }}>{error}</p>}
          </div>
        </div>
      </div>

    </div>
  );
}
