import { useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, X, CheckCircle2, AlertCircle, ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { tilt } from "@/lib/tilt";

interface UploadFile {
  id: string;
  file: File;
  preview: string;
  roomLabel: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

const glass = {
  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid transparent",
  borderRadius: 20,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

export default function UploadPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: UploadFile[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      roomLabel: file.name.replace(/\.[^/.]+$/, ""),
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxSize: 50 * 1024 * 1024,
    multiple: true,
  });

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const updateLabel = (id: string, label: string) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, roomLabel: label } : f)));

  const uploadAll = async () => {
    setUploading(true);
    for (const uf of files.filter((f) => f.status === "pending")) {
      setFiles((prev) => prev.map((f) => f.id === uf.id ? { ...f, status: "uploading" } : f));
      try {
        const formData = new FormData();
        formData.append("file", uf.file);
        formData.append("room_label", uf.roomLabel);
        await api.post(`/api/properties/${propertyId}/photos`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const progress = Math.round((e.loaded * 100) / (e.total ?? 1));
            setFiles((prev) => prev.map((f) => f.id === uf.id ? { ...f, progress } : f));
          },
        });
        setFiles((prev) => prev.map((f) => f.id === uf.id ? { ...f, status: "done", progress: 100 } : f));
      } catch (err: any) {
        setFiles((prev) => prev.map((f) =>
          f.id === uf.id ? { ...f, status: "error", error: err?.response?.data?.detail ?? "Upload failed" } : f
        ));
      }
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["photos", propertyId] });
    navigate(`/dashboard/properties/${propertyId}`);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;

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
            <ImageIcon size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.3, background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Upload Photos
            </h1>
            <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>
              Upload flat property photos — AI will convert them to VR meshes
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

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
            <ImageIcon size={24} color={isDragActive ? "#8b5cf6" : "#a78bfa"} />
          </div>
          <p style={{ fontWeight: 700, fontSize: 15, color: "#1a1d2e", margin: "0 0 6px" }}>
            {isDragActive ? "Drop them here!" : "Drop photos here or click to browse"}
          </p>
          <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0 }}>
            JPG, PNG, WebP — max 50 MB per file · Multiple files supported
          </p>
        </div>

        {/* ── File queue ── */}
        {files.length > 0 && (
          <div style={glass}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1a1d2e", margin: 0 }}>
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </p>
              {pendingCount > 0 && (
                <button onClick={uploadAll} disabled={uploading} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 18px", borderRadius: 12, border: "none",
                  background: uploading ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg,#8b5cf6,#ec4899)",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: uploading ? "not-allowed" : "pointer",
                  boxShadow: uploading ? "none" : "0 4px 16px rgba(139,92,246,0.3)",
                  transition: "opacity 0.2s",
                }}
                  onMouseEnter={e => { if (!uploading) e.currentTarget.style.opacity = "0.88"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                >
                  <Upload size={13} />
                  {uploading ? "Uploading…" : `Upload ${pendingCount} photo${pendingCount !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>

            {/* File rows */}
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {files.map((uf) => (
                <div key={uf.id} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 14px", borderRadius: 14,
                  background: "rgba(255,255,255,0.8) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", border: "1.5px solid transparent",
                }} {...tilt}>
                  {/* Thumbnail */}
                  <div style={{
                    width: 56, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0,
                    background: "rgba(139,92,246,0.06)",
                  }}>
                    <img src={uf.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>

                  {/* Label + progress */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={uf.roomLabel}
                      onChange={(e) => updateLabel(uf.id, e.target.value)}
                      disabled={uf.status !== "pending"}
                      style={{
                        width: "100%", fontSize: 13, fontWeight: 600, color: "#1a1d2e",
                        background: "transparent", border: "none", borderBottom: "1px solid transparent",
                        outline: "none", paddingBottom: 2, transition: "border-color 0.15s",
                      }}
                      placeholder="Room label (e.g. Living Room)"
                      onFocus={e => (e.currentTarget.style.borderBottomColor = "#8b5cf6")}
                      onBlur={e => (e.currentTarget.style.borderBottomColor = "transparent")}
                    />
                    {uf.status === "uploading" && (
                      <div style={{ marginTop: 6, height: 3, borderRadius: 4, background: "rgba(139,92,246,0.12)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${uf.progress}%`, background: "linear-gradient(135deg,#8b5cf6,#ec4899)", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                    )}
                    {uf.status === "error" && (
                      <p style={{ fontSize: 11, color: "#ef4444", margin: "4px 0 0" }}>{uf.error}</p>
                    )}
                    {uf.status === "done" && (
                      <p style={{ fontSize: 11, color: "#22c55e", margin: "4px 0 0" }}>Uploaded successfully</p>
                    )}
                  </div>

                  {/* Status icon */}
                  <div style={{ flexShrink: 0 }}>
                    {uf.status === "done"      && <CheckCircle2 size={17} color="#22c55e" />}
                    {uf.status === "error"     && <AlertCircle  size={17} color="#ef4444" />}
                    {uf.status === "uploading" && <div style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 700 }}>{uf.progress}%</div>}
                    {uf.status === "pending"   && (
                      <button onClick={() => removeFile(uf.id)} style={{
                        width: 28, height: 28, borderRadius: 8, border: "none",
                        background: "rgba(239,68,68,0.06)", color: "#d1d5db",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; e.currentTarget.style.color = "#d1d5db"; }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
