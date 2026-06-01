import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, MapPin, Image, Compass, Trash2, ChevronRight, Search, Camera, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Property, PropertyType } from "@/types";
import { formatDate } from "@/lib/utils";
import { tilt } from "@/lib/tilt";

const propertyTypeLabels: Record<PropertyType, string> = {
  apartment: "Apartment", house: "House", villa: "Villa",
  commercial: "Commercial", land: "Land",
};

const TYPE_COLORS: Record<string, string> = {
  apartment: "#8b5cf6", house: "#06b6d4", villa: "#ec4899",
  commercial: "#f59e0b", land: "#10b981",
};

export default function PropertiesPage() {
  const [showCreate, setShowCreate]     = useState(false);
  const [name, setName]                 = useState("");
  const [address, setAddress]           = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [search, setSearch]             = useState("");
  const [coverPhoto, setCoverPhoto]     = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const qc       = useQueryClient();
  const navigate = useNavigate();

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverPhoto(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const clearCover = () => {
    setCoverPhoto(null);
    setCoverPreview(null);
  };

  const closeModal = () => {
    setShowCreate(false);
    setName(""); setAddress(""); setPropertyType("apartment");
    clearCover();
  };

  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: () => api.get("/api/properties").then((r) => r.data.items),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/api/properties", { name, address, property_type: propertyType });
      if (coverPhoto) {
        const form = new FormData();
        form.append("file", coverPhoto);
        form.append("room_label", "Cover Photo");
        await api.post(`/api/properties/${res.data.id}/photos`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      return res;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      closeModal();
      navigate(coverPhoto
        ? `/dashboard/properties/${res.data.id}`
        : `/dashboard/properties/${res.data.id}/upload`
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/properties/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });

  const filtered = properties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out" }}>

      {/* ── Breadcrumb ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "#9ca3af", textTransform: "uppercase" }}>
          Projects
        </span>
        <ChevronRight size={12} color="#d1d5db" />
      </div>

      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)",
          border: "1.5px solid transparent", borderRadius: 12,
          padding: "0 14px", height: 38, flex: 1, maxWidth: 340,
        }}>
          <Search size={14} color="#9ca3af" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search properties…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "#374151" }}
          />
        </div>

        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
            flexShrink: 0,
          }}
        >
          <Plus size={15} /> Add Property
        </button>
      </div>

      {/* ── Create modal ── */}
      {showCreate && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={closeModal}>
          <div style={{
            background: "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)",
            border: "1.5px solid transparent",
            backgroundImage: "linear-gradient(rgba(255,255,255,0.95),rgba(255,255,255,0.95)) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
            borderRadius: 24, padding: 28, width: "100%", maxWidth: 500,
            boxShadow: "0 24px 64px rgba(0,0,0,0.14)",
          }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
              }}>
                <Building2 size={18} color="#fff" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#1a1d2e" }}>New Property</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#8b5cf6" }}>Fill in the details to create your project</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Cover photo upload */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
                  Cover Photo <span style={{ color: "#9ca3af", fontWeight: 500, letterSpacing: 0 }}>(optional)</span>
                </p>
                <label style={{ display: "block", cursor: "pointer" }}>
                  <input
                    type="file" accept="image/*" onChange={handleCoverPick}
                    style={{ display: "none" }}
                  />
                  {coverPreview ? (
                    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", height: 140 }}>
                      <img src={coverPreview} alt="Cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "rgba(0,0,0,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: 0, transition: "opacity 0.2s",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Click to change</span>
                      </div>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); clearCover(); }}
                        style={{
                          position: "absolute", top: 8, right: 8,
                          width: 26, height: 26, borderRadius: "50%", border: "none",
                          background: "rgba(0,0,0,0.5)", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      height: 100, borderRadius: 12, border: "1.5px dashed rgba(139,92,246,0.35)",
                      background: "rgba(139,92,246,0.03)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                      transition: "all 0.2s",
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(139,92,246,0.06)"; (e.currentTarget as HTMLDivElement).style.borderColor = "#8b5cf6"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(139,92,246,0.03)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(139,92,246,0.35)"; }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: "rgba(139,92,246,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Camera size={16} color="#8b5cf6" />
                      </div>
                      <p style={{ fontSize: 12, color: "#8b5cf6", margin: 0, fontWeight: 600 }}>
                        Click to upload cover photo
                      </p>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>JPG, PNG, WebP</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Text fields */}
              {[
                { label: "Property Name", value: name, onChange: setName, placeholder: "Sunset Villa" },
                { label: "Address", value: address, onChange: setAddress, placeholder: "123 Main St, Dubai" },
              ].map(({ label, value, onChange, placeholder }) => (
                <div key={label}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>{label}</p>
                  <input
                    value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10, outline: "none",
                      border: "1px solid rgba(0,0,0,0.1)", background: "rgba(0,0,0,0.03)",
                      fontSize: 14, color: "#1a1d2e", boxSizing: "border-box",
                    }}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #8b5cf6")}
                    onBlur={e => (e.currentTarget.style.border = "1px solid rgba(0,0,0,0.1)")}
                  />
                </div>
              ))}

              {/* Type */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>Type</p>
                <select
                  value={propertyType} onChange={e => setPropertyType(e.target.value as PropertyType)}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10, outline: "none",
                    border: "1px solid rgba(0,0,0,0.1)", background: "rgba(0,0,0,0.03)",
                    fontSize: 14, color: "#1a1d2e", cursor: "pointer",
                  }}
                >
                  {Object.entries(propertyTypeLabels).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!name || !address || createMutation.isPending}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                  background: (!name || !address) ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg,#8b5cf6,#ec4899)",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  cursor: (!name || !address || createMutation.isPending) ? "not-allowed" : "pointer",
                  boxShadow: (!name || !address) ? "none" : "0 4px 16px rgba(139,92,246,0.3)",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={e => { if (name && address && !createMutation.isPending) e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {createMutation.isPending
                  ? (coverPhoto ? "Uploading photo…" : "Creating…")
                  : "Create Property"}
              </button>
              <button
                onClick={closeModal}
                style={{
                  padding: "11px 20px", borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.1)", background: "transparent",
                  color: "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              height: 200, borderRadius: 20,
              background: "linear-gradient(90deg,rgba(255,255,255,0.4) 25%,rgba(255,255,255,0.6) 50%,rgba(255,255,255,0.4) 75%)",
              animation: "shimmer 1.5s infinite", backgroundSize: "400px 100%",
            }} />
          ))}
        </div>

      ) : filtered.length === 0 ? (
        <div style={{
          background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", backdropFilter: "blur(20px)",
          border: "1.5px solid transparent", borderRadius: 24,
          padding: "64px 24px", textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 18, margin: "0 auto 16px",
            background: "linear-gradient(135deg,#8b5cf618,#6366f118)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Building2 size={24} color="#8b5cf6" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#1a1d2e", margin: "0 0 6px" }}>
            {search ? "No matching properties" : "No properties yet"}
          </p>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
            {search ? "Try a different search term" : "Add your first property to get started"}
          </p>
          {!search && (
            <button onClick={() => setShowCreate(true)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 24px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
              color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
            }}>
              <Plus size={14} /> Add Property
            </button>
          )}
        </div>

      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {filtered.map((property) => {
            const color = TYPE_COLORS[property.property_type] ?? "#8b5cf6";
            return (
              <div key={property.id}
                style={{
                  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box", backdropFilter: "blur(20px)",
                  border: "1.5px solid transparent", borderRadius: 20,
                  overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                }}
                {...tilt}
              >
                {/* Hero area */}
                <Link to={`/dashboard/properties/${property.id}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    height: 140, position: "relative",
                    background: `linear-gradient(135deg,${color}18,${color}30)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Building2 size={44} color={color} style={{ opacity: 0.4 }} />
                    {/* Type badge */}
                    <div style={{
                      position: "absolute", top: 10, left: 12,
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                      padding: "3px 10px", borderRadius: 20, textTransform: "uppercase",
                      background: `${color}22`, color, border: `1px solid ${color}44`,
                    }}>
                      {propertyTypeLabels[property.property_type] ?? property.property_type}
                    </div>
                    {/* Delete */}
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); deleteMutation.mutate(property.id); }}
                      style={{
                        position: "absolute", top: 8, right: 8,
                        width: 28, height: 28, borderRadius: 8, border: "none",
                        background: "rgba(239,68,68,0.08)", color: "#ef4444",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", opacity: 0, transition: "opacity 0.15s",
                      }}
                      className="delete-btn"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </Link>

                {/* Info */}
                <div style={{ padding: "14px 16px 16px" }}>
                  <Link to={`/dashboard/properties/${property.id}`} style={{ textDecoration: "none" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#1a1d2e" }}>
                      {property.name}
                    </p>
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
                    <MapPin size={11} color="#9ca3af" />
                    <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {property.address || "No address"}
                    </p>
                  </div>
                  {/* Stats row */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.05)",
                  }}>
                    <div style={{ display: "flex", gap: 14 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6b7280" }}>
                        <Image size={11} color="#9ca3af" /> {property.photo_count}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6b7280" }}>
                        <Compass size={11} color="#9ca3af" /> {property.tour_count}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>{formatDate(property.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        div:hover .delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
