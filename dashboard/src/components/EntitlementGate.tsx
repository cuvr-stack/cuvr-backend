import { Lock } from "lucide-react";
import { Entitlement, FeatureKey, hasFeature } from "@/lib/entitlements";

interface Props {
  entitlement: Entitlement | null | undefined;
  feature: FeatureKey;
  children: React.ReactNode;
  /** Custom label shown on the lock overlay */
  label?: string;
}

/**
 * Wraps any feature card/button.
 * If the feature isn't entitled, shows a lock overlay instead of the children.
 */
export default function EntitlementGate({ entitlement, feature, children, label }: Props) {
  if (hasFeature(entitlement, feature)) {
    return <>{children}</>;
  }

  return (
    <div style={{ position: "relative", display: "contents" }}>
      {/* Render children but blur + block pointer events */}
      <div style={{ filter: "blur(1.5px) grayscale(0.4)", pointerEvents: "none", userSelect: "none", opacity: 0.55 }}>
        {children}
      </div>

      {/* Lock overlay */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 10, zIndex: 10,
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(139,92,246,0.35)",
        }}>
          <Lock size={20} color="#fff" />
        </div>
        <div style={{ textAlign: "center", padding: "0 16px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#1a1d2e" }}>
            {label ?? "Feature Locked"}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
            Contact us to activate
          </p>
          <a
            href="mailto:support@cuvr.ae"
            style={{
              display: "inline-block", marginTop: 10, padding: "6px 16px",
              borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff",
              background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
              textDecoration: "none",
            }}
          >
            Contact Sales →
          </a>
        </div>
      </div>
    </div>
  );
}
