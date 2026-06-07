import { useState } from "react";
import { Lock, CheckCircle2, Clock } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Entitlement, FeatureKey, hasFeature, FEATURE_LABELS } from "@/lib/entitlements";

interface Props {
  entitlement: Entitlement | null | undefined;
  feature: FeatureKey;
  propertyId: string;
  children: React.ReactNode;
}

export default function EntitlementGate({ entitlement, feature, propertyId, children }: Props) {
  const [requested, setRequested] = useState(false);

  // Check existing pending requests for this feature
  const { data: requests } = useQuery({
    queryKey: ["feature-requests", propertyId],
    queryFn: () => api.get(`/api/properties/${propertyId}/feature-requests`).then(r => r.data),
    enabled: !!propertyId && !hasFeature(entitlement, feature),
  });

  const alreadyPending = Array.isArray(requests) &&
    requests.some((r: any) => r.feature === feature && r.status === "pending");
  const alreadyApproved = Array.isArray(requests) &&
    requests.some((r: any) => r.feature === feature && r.status === "approved");

  const requestMutation = useMutation({
    mutationFn: () => api.post(`/api/properties/${propertyId}/feature-requests`, { feature }),
    onSuccess: () => setRequested(true),
  });

  if (hasFeature(entitlement, feature)) return <>{children}</>;

  const isPending  = alreadyPending || requested;
  const featureLabel = FEATURE_LABELS[feature] ?? feature;

  return (
    <div style={{ position: "relative" }}>
      {/* Dimmed content behind */}
      <div style={{ filter: "blur(1.5px) grayscale(0.5)", pointerEvents: "none", userSelect: "none", opacity: 0.45 }}>
        {children}
      </div>

      {/* Lock overlay */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 12, zIndex: 10,
        background: "rgba(255,255,255,0.78)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: isPending ? "linear-gradient(135deg,#22c55e,#16a34a)" : "linear-gradient(135deg,#8b5cf6,#ec4899)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: isPending ? "0 4px 16px rgba(34,197,94,0.35)" : "0 4px 16px rgba(139,92,246,0.35)",
        }}>
          {isPending ? <Clock size={22} color="#fff" /> : <Lock size={22} color="#fff" />}
        </div>

        <div style={{ textAlign: "center", padding: "0 20px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#1a1d2e" }}>
            {isPending ? "Request Pending" : featureLabel}
          </p>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            {isPending
              ? "Your request is under review. We'll notify you once it's approved."
              : "This feature is not activated for this project."}
          </p>

          {!isPending && (
            <button
              onClick={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
              style={{
                padding: "8px 20px", borderRadius: 20, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                color: "#fff", fontSize: 12, fontWeight: 700,
                boxShadow: "0 4px 14px rgba(139,92,246,0.3)",
                opacity: requestMutation.isPending ? 0.7 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {requestMutation.isPending ? "Requesting…" : "Request Access →"}
            </button>
          )}

          {isPending && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <CheckCircle2 size={14} color="#22c55e" />
              <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Request submitted</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
