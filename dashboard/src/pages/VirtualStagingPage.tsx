import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, Image, Sofa } from "lucide-react";
import { api } from "@/lib/api";
import { tilt } from "@/lib/tilt";

const STYLES = [
  { id: "modern",        label: "Modern",        desc: "Clean lines, minimal clutter" },
  { id: "luxury",        label: "Luxury",         desc: "High-end finishes, opulent feel" },
  { id: "scandinavian",  label: "Scandinavian",   desc: "Light wood, neutral tones" },
  { id: "classic",       label: "Classic",        desc: "Traditional elegant furniture" },
  { id: "minimalist",    label: "Minimalist",     desc: "Bare essentials only" },
  { id: "arabic",        label: "Arabic",         desc: "Rich patterns, warm colors" },
  { id: "industrial",    label: "Industrial",     desc: "Raw materials, exposed elements" },
];

const glass = {
  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid transparent",
  borderRadius: 20,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

export default function VirtualStagingPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const [preview, setPreview]             = useState<string | null>(null);
  const [file, setFile]                   = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("modern");
  const [status, setStatus]               = useState<"idle" | "uploading" | "queued" | "error">("idle");
  const [error, setError]                 = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted[0]) return;
    setFile(accepted[0]);
    setPreview(URL.createObjectURL(accepted[0]));
    setStatus("idle");
    setError(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  });

  const handleStage = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("room_label", "Empty Room");
      const uploadRes = await api.post(`/api/properties/${propertyId}/photos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await api.post(`/api/ai/photos/${uploadRes.data.id}/stage`, { style: selectedStyle });
      setStatus("queued");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Something went wrong");
      setStatus("error");
    }
  };

  const isProcessing = status === "uploading" || status === "queued";

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out" }}>

      {/* ── Breadcrumb ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          }}>
            <Sofa size={16} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.3, background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Stage Room
            </h1>
            <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>
              Upload an empty room — AI furnishes it in your chosen style
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── Left: Upload + Style ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Dropzone */}
          <div {...getRootProps()} {...tilt} style={{
            ...glass,
            minHeight: 220, cursor: "pointer", overflow: "hidden",
            border: isDragActive ? "2px dashed #8b5cf6" : "1px solid rgba(255,255,255,0.85)",
            background: isDragActive ? "rgba(139,92,246,0.06)" : "rgba(255,255,255,0.65)",
            transition: "all 0.2s",
          }}>
            <input {...getInputProps()} />
            {preview ? (
              <img src={preview} alt="Room" style={{ width: "100%", height: 220, objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 12 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.1))",
                }}>
                  <Image size={22} color="#8b5cf6" />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#1a1d2e", margin: "0 0 4px" }}>
                    {isDragActive ? "Drop it here!" : "Drop empty room photo"}
                  </p>
                  <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>JPG, PNG, WebP — max 50 MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Style selector */}
          <div style={glass} {...tilt}>
            <div style={{ padding: "16px 20px 12px" }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#8b5cf6", textTransform: "uppercase", margin: "0 0 14px" }}>
                Interior Style
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {STYLES.map(s => {
                  const active = selectedStyle === s.id;
                  return (
                    <button key={s.id} onClick={() => setSelectedStyle(s.id)} style={{
                      textAlign: "left", padding: "10px 14px", borderRadius: 12, cursor: "pointer",
                      background: active
                        ? "linear-gradient(135deg,#8b5cf6,#ec4899)"
                        : "linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
                      border: active ? "none" : "1.5px solid transparent",
                      transition: "all 0.15s",
                    }}
                      onMouseEnter={e => !active && (e.currentTarget.style.opacity = "0.8")}
                      onMouseLeave={e => !active && (e.currentTarget.style.opacity = "1")}
                    >
                      <p style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? "#fff" : "#1a1d2e", margin: "0 0 3px" }}>
                        {s.label}
                      </p>
                      <p style={{ fontSize: 12, color: active ? "#fca5a5" : "#9ca3af", margin: 0, lineHeight: 1.4 }}>{s.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CTA */}
            <div style={{ padding: "0 20px 20px" }}>
              <button
                onClick={handleStage}
                disabled={!file || isProcessing}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                  cursor: !file || isProcessing ? "not-allowed" : "pointer",
                  background: !file || isProcessing
                    ? "rgba(139,92,246,0.3)"
                    : "linear-gradient(135deg,#8b5cf6,#ec4899)",
                  color: "#fff", fontWeight: 800, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: !file || isProcessing ? "none" : "0 4px 20px rgba(139,92,246,0.35)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { if (file && !isProcessing) e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {status === "uploading" ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> :
                 status === "queued"    ? <><Loader2 size={16} className="animate-spin" /> AI Staging…</> :
                 <><Sparkles size={16} /> Stage This Room</>}
              </button>
              {error && <p style={{ fontSize: 12, color: "#ef4444", textAlign: "center", margin: "8px 0 0" }}>{error}</p>}
            </div>
          </div>
        </div>

        {/* ── Right: Status / Instructions ── */}
        <div style={{
          ...glass,
          minHeight: 380, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: 32, textAlign: "center",
        }} {...tilt}>
          {status === "idle" && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
                background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.1))",
              }}>
                <Sparkles size={26} color="#8b5cf6" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1a1d2e", margin: "0 0 20px" }}>How it works</h2>
              <ol style={{ textAlign: "left", listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Upload a photo of an empty room",
                  "Choose your interior style",
                  "AI furnishes the room realistically",
                  "Result is added to your photos",
                  "Include in your VR tour",
                ].map((step, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.1))",
                      color: "#8b5cf6", fontWeight: 800, fontSize: 11, marginTop: 1,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {isProcessing && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", border: "3px solid transparent",
                borderTopColor: "#8b5cf6", animation: "spin 1s linear infinite", marginBottom: 20,
                background: "linear-gradient(white, white) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
              }} />
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1a1d2e", margin: "0 0 8px" }}>
                {status === "uploading" ? "Uploading photo…" : "AI is furnishing your room…"}
              </h2>
              {status === "queued" && (
                <p style={{ fontSize: 13, color: "#6b7280" }}>This takes 1–3 minutes. The result will appear in your property photos.</p>
              )}
            </>
          )}

          {status === "queued" && (
            <div style={{
              marginTop: 20, padding: 16, borderRadius: 14, width: "100%", textAlign: "left",
              background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <CheckCircle2 size={14} color="#8b5cf6" />
                <p style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6", margin: 0 }}>Processing queued</p>
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
                Go back to the property page to see the result when ready.
              </p>
              <Link to={`/dashboard/properties/${propertyId}`} style={{
                fontSize: 12, fontWeight: 700, color: "#8b5cf6", textDecoration: "none",
              }}>
                Back to property →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
