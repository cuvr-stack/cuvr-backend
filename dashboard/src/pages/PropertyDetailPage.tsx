import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Compass, Image, CheckCircle2, Clock, AlertCircle,
  Loader2, X, RefreshCw, Video, Sparkles, Wand2, Sofa, PenTool,
  Upload, ChevronRight, Zap, Eye, LayoutDashboard, MapPin, Building2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Property, Photo, Video as VideoType } from "@/types";
import { cn, formatDate, assetUrl } from "@/lib/utils";
import ParallaxViewer from "@/components/ParallaxViewer";
import SceneVariationModal from "@/components/SceneVariationModal";
import SplatViewer from "@/components/ui/SplatViewer";
import { useEntitlement } from "@/hooks/useEntitlement";
import { FEATURES, hasFeature } from "@/lib/entitlements";
import { Lock } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PhotoVariation {
  id: string;
  photo_id: string;
  room_label?: string;
  original_url?: string;
  status: "pending" | "processing" | "ready" | "failed";
  variation_url?: string;
  style?: string;
  color?: string;
  prompt?: string;
  ai_model?: string;
  created_at: string;
}

// ── Status configs ─────────────────────────────────────────────────────────────

const statusConfig = {
  pending:    { icon: Clock,        color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  label: "Pending"    },
  processing: { icon: Loader2,      color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  label: "Processing" },
  ready:      { icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.12)",   label: "Ready"      },
  failed:     { icon: AlertCircle,  color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "Failed"     },
};

const videoStatusConfig = {
  pending:    { color: "#f59e0b", label: "Pending"      },
  extracting: { color: "#3b82f6", label: "Extracting"   },
  processing: { color: "#3b82f6", label: "Processing 3D"},
  ready:      { color: "#22c55e", label: "Ready"        },
  failed:     { color: "#ef4444", label: "Failed"       },
};

const MODEL_LABELS: Record<string, string> = {
  standard: "FLUX Schnell",
  quality:  "FLUX Dev",
  ultra:    "FLUX Ultra",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: entitlement } = useEntitlement(id);
  const [activePhoto,    setActivePhoto]    = useState<Photo | null>(null);
  const [variationPhoto, setVariationPhoto] = useState<Photo | null>(null);
  const [activeSplat,    setActiveSplat]    = useState<VideoType | null>(null);
  const [previewVariation, setPreviewVariation] = useState<PhotoVariation | null>(null);
  const qc = useQueryClient();

  const retryMutation = useMutation({
    mutationFn: (photoId: string) => api.post(`/api/photos/${photoId}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", id] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => api.delete(`/api/photos/${photoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", id] }),
  });

  const { data: property, isLoading: propLoading } = useQuery<Property>({
    queryKey: ["property", id],
    queryFn: () => api.get(`/api/properties/${id}`).then((r) => r.data),
  });

  const { data: photos = [], isLoading: photosLoading } = useQuery<Photo[]>({
    queryKey: ["photos", id],
    queryFn: () => api.get(`/api/properties/${id}/photos`).then((r) => r.data.items),
    refetchInterval: (q) =>
      (q.state.data as Photo[] | undefined)?.some(
        (p) => p.processing_status === "processing" || p.processing_status === "pending"
      ) ? 3000 : false,
  });

  const { data: videos = [] } = useQuery<VideoType[]>({
    queryKey: ["videos", id],
    queryFn: () => api.get(`/api/properties/${id}/videos`).then((r) => r.data.items ?? r.data),
    refetchInterval: (q) =>
      (q.state.data as VideoType[] | undefined)?.some(
        (v) => v.status === "pending" || v.status === "extracting" || v.status === "processing"
      ) ? 5000 : false,
  });

  const { data: variationsData } = useQuery<{ items: PhotoVariation[]; total: number }>({
    queryKey: ["variations", id],
    queryFn: () => api.get(`/api/ai/properties/${id}/variations`).then((r) => r.data),
    refetchInterval: (q) =>
      (q.state.data as { items: PhotoVariation[] } | undefined)?.items?.some(
        (v) => v.status === "pending" || v.status === "processing"
      ) ? 4000 : false,
  });
  const variations = variationsData?.items ?? [];

  // ── Modals ──────────────────────────────────────────────────────────────────

  const ParallaxModal = activePhoto?.thumbnail_url && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: "rgba(0,0,0,0.95)" }}
      onClick={() => setActivePhoto(null)}>
      <div className="relative w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "linear-gradient(160deg,#08101f,#060c1a)", border: "1px solid rgba(0,230,118,0.3)", boxShadow: "0 0 100px rgba(0,230,118,0.18),0 40px 80px rgba(0,0,0,0.7)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(0,230,118,0.1)", background: "rgba(0,230,118,0.03)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm leading-none">Immersive View</p>
              <p className="text-xs mt-0.5" style={{ color: "#ffffff" }}>{activePhoto.room_label ?? activePhoto.filename}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{ background: "rgba(0,230,118,0.1)", color: "rgba(0,230,118,0.8)", border: "1px solid rgba(0,230,118,0.2)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
              Move cursor to explore
            </span>
            <button onClick={() => setActivePhoto(null)}
              className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" style={{ color: "#ffffff" }} />
            </button>
          </div>
        </div>
        <ParallaxViewer imageUrl={assetUrl(activePhoto.thumbnail_url)} height={580} />
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid rgba(0,230,118,0.1)", background: "rgba(0,0,0,0.3)" }}>
          <p className="text-xs" style={{ color: "#445566" }}>Parallax depth effect · hover to pan</p>
          <a href={assetUrl(activePhoto.thumbnail_url)} download={activePhoto.filename ?? "photo.jpg"}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "#ffffff" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download
          </a>
        </div>
      </div>
    </div>
  );

  const SplatModal = activeSplat?.splat_url && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={() => setActiveSplat(null)}>
      <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden"
        style={{ background: "rgba(12,15,26,0.98)", border: "1px solid rgba(0,230,118,0.3)", boxShadow: "0 0 60px rgba(0,230,118,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(0,230,118,0.12)" }}>
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4" style={{ color: "#00e676" }} />
            <span className="font-semibold text-sm text-white">{activeSplat.filename}</span>
          </div>
          <button onClick={() => setActiveSplat(null)} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" style={{ color: "#ffffff" }} />
          </button>
        </div>
        <SplatViewer src={assetUrl(activeSplat.splat_url)} height={500} />
        <div className="px-5 py-3" style={{ borderTop: "1px solid rgba(0,230,118,0.12)" }}>
          <p className="text-xs" style={{ color: "#ffffff" }}>Drag to explore · Scroll to zoom · Gaussian Splat scene</p>
        </div>
      </div>
    </div>
  );

  // Variation preview lightbox
  const VariationPreviewModal = previewVariation?.variation_url && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={() => setPreviewVariation(null)}>
      <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,10,20,0.98)", border: "1px solid rgba(0,230,118,0.25)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(0,230,118,0.1)" }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}>
              <Wand2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{previewVariation.room_label ?? "AI Render"}</p>
              <p className="text-xs" style={{ color: "#ffffff" }}>
                {previewVariation.style && `${previewVariation.style} · `}
                {MODEL_LABELS[previewVariation.ai_model ?? "quality"] ?? "FLUX Dev"}
              </p>
            </div>
          </div>
          <button onClick={() => setPreviewVariation(null)}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" style={{ color: "#ffffff" }} />
          </button>
        </div>
        <div className="grid grid-cols-2" style={{ minHeight: 400 }}>
          {previewVariation.original_url && (
            <div className="relative">
              <img src={assetUrl(previewVariation.original_url)} alt="Original"
                className="w-full h-full object-cover" style={{ maxHeight: 500 }} />
              <span className="absolute bottom-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(0,0,0,0.7)", color: "white" }}>Original</span>
            </div>
          )}
          <div className="relative">
            <img src={assetUrl(previewVariation.variation_url)} alt="AI Render"
              className="w-full h-full object-cover" style={{ maxHeight: 500 }} />
            <span className="absolute bottom-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(0,230,118,0.8)", color: "white" }}>AI Render</span>
          </div>
        </div>
        {previewVariation.prompt && (
          <div className="px-5 py-3" style={{ borderTop: "1px solid rgba(0,230,118,0.1)" }}>
            <p className="text-xs" style={{ color: "#ffffff" }}>
              <span style={{ color: "#00e676" }}>Prompt: </span>{previewVariation.prompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  if (propLoading) return (
    <div className="animate-pulse h-8 w-64 rounded-xl" style={{ background: "rgba(0,230,118,0.1)" }} />
  );
  if (!property) return <p style={{ color: "#ffffff" }}>Property not found.</p>;

  const readyVariations  = variations.filter(v => v.status === "ready");
  const activeVariations = variations.filter(v => v.status === "pending" || v.status === "processing");

  const heroPhoto = photos.find(p => p.processing_status === "ready" && p.thumbnail_url) ?? photos[0];
  const storageGB = photos.length * 0.04; // rough estimate

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out" }}>
      {ParallaxModal}
      {SplatModal}
      {VariationPreviewModal}
      {variationPhoto && <SceneVariationModal photo={variationPhoto} onClose={() => setVariationPhoto(null)} />}

      {/* ── Breadcrumb ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        <Link to="/dashboard/properties" style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "#9ca3af",
          textTransform: "uppercase", textDecoration: "none",
        }}
          onMouseEnter={e => (e.currentTarget.style.color = "#8b5cf6")}
          onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
        >
          Properties
        </Link>
        <ChevronRight size={12} color="#d1d5db" />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "#374151", textTransform: "uppercase" }}>
          {property.name}
        </span>
      </div>

      {/* ── Entitlement badge ── */}
      {entitlement ? (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px 6px 10px", borderRadius: 20, marginBottom: 14,
          background: entitlement.status === "active"
            ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${entitlement.status === "active" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: entitlement.status === "active" ? "#22c55e" : "#ef4444",
            boxShadow: entitlement.status === "active" ? "0 0 6px rgba(34,197,94,0.5)" : "none",
          }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: entitlement.status === "active" ? "#15803d" : "#dc2626", letterSpacing: 0.4 }}>
            {entitlement.code}
          </span>
          {entitlement.package_name && (
            <span style={{ fontSize: 11, color: "#6b7280", borderLeft: "1px solid #e5e7eb", paddingLeft: 8, marginLeft: 2 }}>
              {entitlement.package_name}
            </span>
          )}
        </div>
      ) : (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "5px 12px", borderRadius: 20, marginBottom: 14,
          background: "rgba(156,163,175,0.1)", border: "1px solid rgba(156,163,175,0.2)",
        }}>
          <Lock size={11} color="#9ca3af" />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>No entitlement — features locked</span>
          <a href="mailto:support@cuvr.ae" style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", textDecoration: "none", marginLeft: 4 }}>
            Contact us →
          </a>
        </div>
      )}

      {/* ── Action bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([
            { to: `upload`,          icon: Upload,          label: "Upload Photos",  color: "#6366f1", feature: FEATURES.RENDER_3D },
            { to: `upload-video`,    icon: Video,           label: "Upload Video",   color: "#ec4899", feature: FEATURES.RENDER_3D },
            { to: `floor-plan`,      icon: LayoutDashboard, label: "Floor Plan",     color: "#06b6d4", feature: FEATURES.FLOOR_PLAN },
            { to: `virtual-staging`, icon: Sofa,            label: "Stage Room",     color: "#f59e0b", feature: FEATURES.VIRTUAL_STAGING },
            { to: `sketch-render`,   icon: PenTool,         label: "Sketch Render",  color: "#10b981", feature: FEATURES.SKETCH_RENDER },
          ] as const).map(({ to, icon: Icon, label, color, feature }) => {
            const unlocked = hasFeature(entitlement, feature);
            return (
              <div key={to} style={{ position: "relative" }} title={unlocked ? label : "Contact sales to activate"}>
                <Link to={unlocked ? `/dashboard/properties/${id}/${to}` : "#"}
                  onClick={e => { if (!unlocked) e.preventDefault(); }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    padding: "10px 14px", borderRadius: 12, textDecoration: "none",
                    background: unlocked ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)",
                    backdropFilter: "blur(10px)",
                    border: "1.5px solid transparent",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    transition: "background 0.15s, transform 0.15s, box-shadow 0.15s",
                    minWidth: 72, cursor: unlocked ? "pointer" : "not-allowed",
                    opacity: unlocked ? 1 : 0.6,
                    filter: unlocked ? "none" : "grayscale(0.4)",
                  }}
                  onMouseEnter={e => { if (unlocked) { const el = e.currentTarget as HTMLAnchorElement; el.style.background = "rgba(255,255,255,0.95)"; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"; }}}
                  onMouseLeave={e => { if (unlocked) { const el = e.currentTarget as HTMLAnchorElement; el.style.background = "rgba(255,255,255,0.7)"; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: unlocked ? `${color}15` : "rgba(156,163,175,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {unlocked ? <Icon size={15} color={color} /> : <Lock size={13} color="#9ca3af" />}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: unlocked ? "#6b7280" : "#9ca3af", whiteSpace: "nowrap", letterSpacing: 0.2 }}>
                    {label}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        {hasFeature(entitlement, FEATURES.WALKTHROUGH) ? (
          <Link to={`/dashboard/properties/${id}/tour-builder`}
            style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: "12px 24px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
              color: "#fff", fontSize: 14, fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
              transition: "opacity 0.15s, transform 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.9"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)"; }}
          >
            <div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Compass size={14} color="#fff" />
            </div>
            Build VR Tour
          </Link>
        ) : (
          <div title="Upgrade to unlock VR Walkthrough" style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "12px 24px", borderRadius: 14,
            background: "rgba(139,92,246,0.12)", border: "1.5px solid rgba(139,92,246,0.2)",
            color: "#9ca3af", fontSize: 14, fontWeight: 700, cursor: "not-allowed", flexShrink: 0,
          }}>
            <Lock size={14} color="#9ca3af" />
            VR Walkthrough Locked
          </div>
        )}
      </div>

      {/* ── Hero card ── */}
      <div style={{
        background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", backdropFilter: "blur(20px)",
        border: "1.5px solid transparent", borderRadius: 24,
        overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
        marginBottom: 16,
      }}>
        {/* Image area */}
        <div style={{ position: "relative", height: 320 }}>
          {heroPhoto?.thumbnail_url ? (
            <img src={assetUrl(heroPhoto.thumbnail_url)} alt={property.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              background: "linear-gradient(135deg,#1a1d2e,#2d3148)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Building2 size={60} color="rgba(139,92,246,0.4)" />
            </div>
          )}

          {/* Dark gradient overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(10,12,24,0.85) 0%, rgba(10,12,24,0.3) 50%, transparent 100%)",
          }} />

          {/* Reprocess button */}
          <button
            onClick={() => heroPhoto && retryMutation.mutate(heroPhoto.id)}
            style={{
              position: "absolute", top: 14, right: 14,
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)",
              color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={11} /> REPROCESS 4K
          </button>

          {/* Source chips */}
          <div style={{ position: "absolute", bottom: 16, left: 16, display: "flex", gap: 8 }}>
            <div style={{
              background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10,
              padding: "6px 12px",
            }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Asset Source</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: "#fff" }}>
                {heroPhoto?.filename?.split(".")[0] ?? property.name.toLowerCase().replace(/ /g, "_")}
              </p>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10,
              padding: "6px 12px",
            }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Processed</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: "#fff" }}>
                {new Date(property.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: "18px 20px 20px" }}>
          {/* Badges */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {photos.some(p => p.processing_status === "ready") && (
              <span style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(99,102,241,0.15))",
                color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.25)",
              }}>AI OPTIMIZED</span>
            )}
            {readyVariations.length > 0 && (
              <span style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: "rgba(16,185,129,0.1)", color: "#10b981",
                border: "1px solid rgba(16,185,129,0.25)",
              }}>READY FOR EXPORT</span>
            )}
            {activeVariations.length > 0 && (
              <span style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: "rgba(59,130,246,0.1)", color: "#3b82f6",
                border: "1px solid rgba(59,130,246,0.25)",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                {activeVariations.length} PROCESSING
              </span>
            )}
          </div>

          {/* Stats + description */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 32 }}>
            <p style={{ flex: 1, margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.7 }}>
              {property.address
                ? `${property.name} — a spatial mesh reconstructed from photogrammetric inputs. Located at ${property.address}.`
                : `${property.name} — a spatial mesh reconstructed from photogrammetric inputs, ready for VR deployment.`}
            </p>
            <div style={{ display: "flex", gap: 28, flexShrink: 0 }}>
              {[
                { value: `${storageGB.toFixed(1)}GB`, label: "Size" },
                { value: `${(photos.length * 2.4).toFixed(1)}ms`, label: "Latency" },
                { value: `${(photos.length * 420).toLocaleString()}`, label: "Polygons" },
              ].map(({ value, label }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1a1d2e", letterSpacing: -0.5 }}>{value}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Spatial Details + Map row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

        {/* Spatial Details */}
        <div style={{
          background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", backdropFilter: "blur(20px)",
          border: "1.5px solid transparent", borderRadius: 20,
          padding: "18px 20px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: "#9ca3af", textTransform: "uppercase" }}>
              Spatial Details
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Eye size={13} color="#8b5cf6" />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", textTransform: "uppercase" }}>Coordinate Sys</p>
              <div style={{ display: "flex", gap: 6 }}>
                {["WGS84", "UTM"].map((sys, i) => (
                  <span key={sys} style={{
                    padding: "3px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    color: i === 0 ? "#8b5cf6" : "#6b7280",
                    borderBottom: i === 0 ? "2px solid #8b5cf6" : "2px solid transparent",
                    cursor: "pointer",
                  }}>{sys}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", textTransform: "uppercase" }}>Accuracy</p>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>±2.4cm</span>
              </div>
              <div style={{ height: 4, borderRadius: 4, background: "rgba(0,0,0,0.07)" }}>
                <div style={{ height: "100%", width: "88%", borderRadius: 4, background: "linear-gradient(90deg,#8b5cf6,#10b981)" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", textTransform: "uppercase" }}>Cloud Engine</p>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#10b981" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                Active
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", textTransform: "uppercase" }}>Photos</p>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1d2e" }}>{photos.length}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", textTransform: "uppercase" }}>Tours</p>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1d2e" }}>{property.tour_count}</span>
            </div>
          </div>
        </div>

        {/* Coordinate / Location card */}
        <div style={{
          borderRadius: 20, overflow: "hidden", position: "relative",
          background: "linear-gradient(135deg,#0f172a,#1e1b4b)",
          border: "1px solid rgba(139,92,246,0.2)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
          minHeight: 200,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          {/* Grid lines */}
          <div style={{
            position: "absolute", inset: 0, opacity: 0.15,
            backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.6) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />
          {/* Glowing ring */}
          <div style={{
            position: "relative", zIndex: 1,
            width: 80, height: 80, borderRadius: "50%",
            border: "1px solid rgba(139,92,246,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 40px rgba(139,92,246,0.2)",
            background: "rgba(139,92,246,0.08)",
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: "50%",
              border: "1px solid rgba(139,92,246,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(139,92,246,0.12)",
            }}>
              <MapPin size={20} color="#a78bfa" />
            </div>
          </div>
          {/* Location label */}
          <div style={{ position: "relative", zIndex: 1, textAlign: "center", marginTop: 14 }}>
            <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(139,92,246,0.7)", textTransform: "uppercase" }}>
              {property.address?.split(",").pop()?.trim() ?? "Location"}
            </p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e2d9fe", letterSpacing: 1 }}>
              {property.address?.toUpperCase() ?? property.name.toUpperCase()}
            </p>
          </div>
          {/* Coordinates */}
          <p style={{
            position: "absolute", top: 10, right: 12, zIndex: 1,
            fontSize: 9, fontWeight: 600, letterSpacing: 0.5, color: "rgba(167,139,250,0.6)",
            fontFamily: "monospace",
          }}>
            25.0819° N, 55.1438° E
          </p>
        </div>
      </div>

      {/* ── AI Renders / Generation History ────────────────────────────────── */}
      {variations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Zap size={14} color="#fff" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1d2e" }}>AI Generation History</p>
                <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                  {readyVariations.length} render{readyVariations.length !== 1 ? "s" : ""} ready
                  {activeVariations.length > 0 && ` · ${activeVariations.length} processing`}
                </p>
              </div>
            </div>
            {activeVariations.length > 0 && (
              <span style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                padding: "6px 14px", borderRadius: 20,
                background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.2)",
              }}>
                <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                {activeVariations.length} generating…
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
            {variations.map((v) => (
              <div key={v.id}
                style={{
                  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", backdropFilter: "blur(20px)",
                  border: "1.5px solid transparent", borderRadius: 16,
                  overflow: "hidden", cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                  transition: "transform 0.18s, box-shadow 0.18s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 28px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)";
                }}
                onClick={() => v.status === "ready" && setPreviewVariation(v)}
              >
                <div style={{ aspectRatio: "16/10", position: "relative", background: "rgba(139,92,246,0.05)" }}>
                  {v.status === "ready" && v.variation_url ? (
                    <>
                      <img src={assetUrl(v.variation_url)} alt="AI Render"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{
                        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.4)", opacity: 0, transition: "opacity 0.15s",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                      >
                        <div style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, color: "#fff",
                          background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                        }}>
                          <Eye size={12} /> Compare
                        </div>
                      </div>
                    </>
                  ) : v.status === "processing" || v.status === "pending" ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                      <Loader2 size={24} color="#8b5cf6" style={{ animation: "spin 1s linear infinite" }} />
                      <p style={{ margin: 0, fontSize: 11, color: "#8b5cf6" }}>Generating…</p>
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <AlertCircle size={24} color="#ef4444" />
                    </div>
                  )}
                  <div style={{
                    position: "absolute", top: 6, left: 6,
                    fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                    background: "rgba(139,92,246,0.85)", color: "#fff", backdropFilter: "blur(4px)",
                  }}>
                    {MODEL_LABELS[v.ai_model ?? "quality"] ?? "FLUX Dev"}
                  </div>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#1a1d2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.room_label ?? "Scene Render"}
                    </p>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                      background: v.status === "ready" ? "rgba(16,185,129,0.1)" : v.status === "failed" ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
                      color: v.status === "ready" ? "#10b981" : v.status === "failed" ? "#ef4444" : "#3b82f6",
                    }}>{v.status}</span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>{formatDate(v.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Original Photos ──────────────────────────────────────────────────── */}
      {(photosLoading || photos.length > 0) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Image size={16} color="#6b7280" />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1d2e" }}>Photos ({photos.length})</p>
          </div>

          {photosLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ aspectRatio: "16/10", borderRadius: 16, background: "rgba(255,255,255,0.4)" }} />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
              {photos.map((photo) => {
                const status = statusConfig[photo.processing_status];
                const Icon = status.icon;
                return (
                  <div key={photo.id}
                    style={{
                      background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", backdropFilter: "blur(20px)",
                      border: "1.5px solid transparent", borderRadius: 16,
                      overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                      transition: "transform 0.18s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"}
                    className="group"
                  >
                    <div style={{ aspectRatio: "16/10", position: "relative", background: "rgba(139,92,246,0.05)" }}>
                      {photo.thumbnail_url ? (
                        <img src={assetUrl(photo.thumbnail_url)} alt={photo.filename}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Image size={28} color="#d1d5db" />
                        </div>
                      )}
                      <div style={{
                        position: "absolute", top: 6, right: 6,
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                        background: status.bg, color: status.color,
                      }}>
                        <Icon size={10} className={cn(photo.processing_status === "processing" && "animate-spin")} />
                        {status.label}
                      </div>
                      {photo.processing_status === "processing" && (
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(139,92,246,0.1)" }}>
                          <div style={{ height: "100%", width: `${photo.processing_progress || 10}%`, background: "linear-gradient(90deg,#8b5cf6,#ec4899)" }} />
                        </div>
                      )}
                      {photo.processing_status === "ready" && photo.thumbnail_url && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(0,0,0,0.45)" }}>
                          <button onClick={() => setActivePhoto(photo)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: "none", background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#000", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            <Sparkles size={10} /> Immersive
                          </button>
                          <button onClick={() => setVariationPhoto(photo)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            <Wand2 size={10} /> Visualise
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#1a1d2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {photo.room_label ?? photo.filename}
                        </p>
                        <button onClick={() => deleteMutation.mutate(photo.id)}
                          disabled={deleteMutation.isPending}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 2, flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={e => (e.currentTarget.style.color = "#d1d5db")}
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{formatDate(photo.created_at)}</span>
                        <button onClick={() => retryMutation.mutate(photo.id)}
                          disabled={retryMutation.isPending}
                          style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, color: "#8b5cf6", padding: 0 }}
                        >
                          <RefreshCw size={9} className={cn(retryMutation.isPending && "animate-spin")} />
                          {retryMutation.isPending ? "…" : "Retry"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 3D Gaussian Splats ──────────────────────────────────────────────── */}
      {videos.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Video size={16} color="#6b7280" />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1d2e" }}>3D Gaussian Splats ({videos.length})</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
            {videos.map((video) => {
              const vc = videoStatusConfig[video.status] ?? videoStatusConfig.pending;
              return (
                <div key={video.id} style={{
                  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", backdropFilter: "blur(20px)",
                  border: "1.5px solid transparent", borderRadius: 16,
                  overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                }}>
                  <div style={{ height: 140, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(139,92,246,0.05)" }}>
                    {video.thumbnail_url ? (
                      <img src={assetUrl(video.thumbnail_url)} alt={video.filename}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Video size={36} color="#d1d5db" />
                    )}
                    <div style={{ position: "absolute", top: 6, right: 6, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: `${vc.color}18`, color: vc.color }}>
                      {vc.label}
                    </div>
                    {video.status === "ready" && video.splat_url && (
                      <button onClick={() => setActiveSplat(video)}
                        style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", border: "none", cursor: "pointer", opacity: 0, transition: "opacity 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 20, background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                          <Sparkles size={12} /> View 3D Splat
                        </div>
                      </button>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#1a1d2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.filename}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>
                      {video.file_size_bytes ? `${(video.file_size_bytes / 1024 / 1024).toFixed(0)} MB` : ""}
                      {video.duration_seconds ? ` · ${video.duration_seconds}s` : ""}
                    </p>
                    {video.error_message && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#ef4444" }}>{video.error_message}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .group:hover .delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
