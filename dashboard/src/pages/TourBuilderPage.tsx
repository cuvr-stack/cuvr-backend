import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, Compass } from "lucide-react";
import { api } from "@/lib/api";
import { Photo } from "@/types";
import { cn } from "@/lib/utils";

export default function TourBuilderPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tourName, setTourName] = useState("Property Tour");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  const { data: photos = [] } = useQuery<Photo[]>({
    queryKey: ["photos", propertyId],
    queryFn: () => api.get(`/api/properties/${propertyId}/photos`).then((r) => r.data.items),
  });

  const readyPhotos = photos.filter((p) => p.processing_status === "ready");

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/tours", {
        property_id: propertyId,
        name: tourName,
        photo_ids: selectedPhotoIds,
      }),
    onSuccess: (res) => navigate(`/dashboard/tours`),
  });

  const togglePhoto = (id: string) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          to={`/dashboard/properties/${propertyId}`}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "#ffffff" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,230,118,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "white" }}>Tour Builder</h1>
          <p className="text-sm" style={{ color: "#ffffff" }}>
            Select ready photos and sequence them into a VR walkthrough
          </p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5" style={{ color: "white" }}>Tour Name</label>
        <input
          value={tourName}
          onChange={(e) => setTourName(e.target.value)}
          className="w-full max-w-sm px-3 py-2 rounded-lg text-sm outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "white",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#00e676")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
        />
      </div>

      <div>
        <h2 className="font-semibold mb-3" style={{ color: "white" }}>
          Select Scenes ({selectedPhotoIds.length} selected)
        </h2>
        {readyPhotos.length === 0 ? (
          <div
            className="text-center py-10 rounded-xl"
            style={{
              background: "rgba(10,14,30,0.95)",
              border: "1px dashed rgba(0,230,118,0.2)",
            }}
          >
            <Compass className="w-8 h-8 mx-auto mb-2" style={{ color: "#ffffff" }} />
            <p className="text-sm" style={{ color: "#ffffff" }}>
              No ready photos yet. Upload and process photos first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {readyPhotos.map((photo) => {
              const selected = selectedPhotoIds.includes(photo.id);
              const order = selectedPhotoIds.indexOf(photo.id) + 1;
              return (
                <button
                  key={photo.id}
                  onClick={() => togglePhoto(photo.id)}
                  className="relative rounded-xl overflow-hidden text-left transition-all"
                  style={{
                    border: selected
                      ? "2px solid #00e676"
                      : "2px solid rgba(0,230,118,0.2)",
                    boxShadow: selected ? "0 0 16px rgba(0,230,118,0.2)" : "none",
                    background: selected
                      ? "rgba(0,230,118,0.08)"
                      : "rgba(10,14,30,0.95)",
                  }}
                >
                  <div
                    className="aspect-video"
                    style={{ background: "rgba(0,230,118,0.06)" }}
                  >
                    {photo.thumbnail_url ? (
                      <img src={photo.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-xs"
                        style={{ color: "#ffffff" }}
                      >
                        No preview
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium truncate" style={{ color: "white" }}>
                      {photo.room_label ?? photo.filename}
                    </p>
                  </div>
                  {selected && (
                    <div
                      className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: "#00e676" }}
                    >
                      {order}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => createMutation.mutate()}
          disabled={selectedPhotoIds.length === 0 || !tourName || createMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60 text-white"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
        >
          <Save className="w-4 h-4" />
          {createMutation.isPending ? "Creating Tour..." : "Create VR Tour"}
        </button>
        <Link
          to={`/dashboard/properties/${propertyId}`}
          className="px-4 py-2 rounded-xl text-sm text-white hover:opacity-80 transition-opacity"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
