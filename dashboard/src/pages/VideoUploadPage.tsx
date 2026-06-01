import { useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Video, Upload, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { api } from "@/lib/api";
import { tilt } from "@/lib/tilt";

interface UploadVideo {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  videoId?: string;
}

const glass = {
  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid transparent",
  borderRadius: 20,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

const TIPS = [
  "Walk slowly and steadily through each room",
  "Pan 360° — cover walls, floor and ceiling",
  "Keep video 30–90 seconds per room",
  "Good lighting — natural light works best",
  "MP4 format, recorded on iPhone or Android",
  "Avoid fast panning or shaky movement",
];

export default function VideoUploadPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [videos, setVideos] = useState<UploadVideo[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: UploadVideo[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      progress: 0,
    }));
    setVideos((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".avi", ".webm"] },
    maxSize: 2 * 1024 * 1024 * 1024,
    multiple: false,
  });

  const uploadAll = async () => {
    setUploading(true);
    for (const uv of videos.filter((v) => v.status === "pending")) {
      setVideos((prev) => prev.map((v) => v.id === uv.id ? { ...v, status: "uploading" } : v));
      try {
        const formData = new FormData();
        formData.append("file", uv.file);
        const res = await api.post(`/api/properties/${propertyId}/videos`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const progress = Math.round((e.loaded * 100) / (e.total ?? 1));
            setVideos((prev) => prev.map((v) => v.id === uv.id ? { ...v, progress } : v));
          },
        });
        setVideos((prev) => prev.map((v) =>
          v.id === uv.id ? { ...v, status: "done", progress: 100, videoId: res.data.id } : v
        ));
      } catch (err: any) {
        setVideos((prev) => prev.map((v) =>
          v.id === uv.id ? { ...v, status: "error", error: err?.response?.data?.detail ?? "Upload failed" } : v
        ));
      }
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["videos", propertyId] });
  };

  const allDone = videos.length > 0 && videos.every((v) => v.status === "done");

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out", maxWidth: 720 }}>

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
            <Video size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.3, background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Upload Video Scan
            </h1>
            <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>
              Record a slow walkthrough — AI converts it to a 3D Gaussian Splat
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Tips card ── */}
        <div style={{ ...glass, padding: "18px 24px" }} {...tilt}>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, flexShrink: 0,
              background: "rgba(139,92,246,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Info size={16} color="#8b5cf6" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#8b5cf6", textTransform: "uppercase", margin: "0 0 12px" }}>
                Tips for best 3D results
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
                {TIPS.map((tip, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: "50%", marginTop: 6, flexShrink: 0,
                      background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                    }} />
                    <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
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
            <Video size={24} color={isDragActive ? "#8b5cf6" : "#a78bfa"} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 15, color: "#1a1d2e", margin: "0 0 6px" }}>
            {isDragActive ? "Drop it here!" : "Drop your video here or click to browse"}
          </p>
          <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>
            MP4, MOV, AVI, WebM — up to 2 GB
          </p>
        </div>

        {/* ── File list ── */}
        {videos.length > 0 && (
          <div style={{ ...glass, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {videos.map((uv) => (
              <div key={uv.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 16px", borderRadius: 14,
                background: "rgba(255,255,255,0.8) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", border: "1.5px solid transparent",
              }} {...tilt}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: "rgba(139,92,246,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Video size={18} color="#8b5cf6" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1d2e", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {uv.file.name}
                  </p>
                  <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
                    {(uv.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  {uv.status === "uploading" && (
                    <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: "rgba(139,92,246,0.12)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${uv.progress}%`, background: "linear-gradient(135deg,#8b5cf6,#ec4899)", borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                  )}
                  {uv.status === "done" && (
                    <p style={{ fontSize: 11, color: "#22c55e", margin: "4px 0 0" }}>
                      Uploaded — Gaussian Splatting processing started
                    </p>
                  )}
                  {uv.status === "error" && (
                    <p style={{ fontSize: 11, color: "#ef4444", margin: "4px 0 0" }}>{uv.error}</p>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {uv.status === "done"      && <CheckCircle2 size={18} color="#22c55e" />}
                  {uv.status === "error"     && <AlertCircle  size={18} color="#ef4444" />}
                  {uv.status === "uploading" && <Loader2 size={18} color="#8b5cf6" className="animate-spin" />}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              {videos.some((v) => v.status === "pending") && (
                <button onClick={uploadAll} disabled={uploading} style={{
                  flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                  background: uploading ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg,#8b5cf6,#ec4899)",
                  color: "#fff", fontSize: 13, fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer",
                  transition: "opacity 0.2s", boxShadow: uploading ? "none" : "0 4px 16px rgba(139,92,246,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                  onMouseEnter={e => { if (!uploading) e.currentTarget.style.opacity = "0.88"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                >
                  <Upload size={14} />
                  {uploading ? "Uploading…" : "Start Upload & Process"}
                </button>
              )}
              {allDone && (
                <button onClick={() => navigate(`/dashboard/properties/${propertyId}`)} style={{
                  flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(139,92,246,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                >
                  Back to Property
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
