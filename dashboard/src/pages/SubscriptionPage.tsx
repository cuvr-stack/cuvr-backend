import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Zap, Crown, Building, ShoppingBag, Sparkles, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { tilt } from "@/lib/tilt";
import { useAuthStore } from "@/store/authStore";
import { PLANS, getPlan } from "@/lib/plans";

const planIcons = { starter: Zap, professional: Crown, enterprise: Building };

const planColors: Record<string, { from: string; to: string; accent: string }> = {
  starter:      { from: "#06b6d4", to: "#8b5cf6", accent: "#06b6d4" },
  professional: { from: "#8b5cf6", to: "#ec4899", accent: "#8b5cf6" },
  enterprise:   { from: "#f59e0b", to: "#ec4899", accent: "#f59e0b" },
};

const DARK_BG = "linear-gradient(160deg,rgb(26,29,46) 0%,rgb(45,31,78) 100%)";

const glass = {
  background: "rgba(255,255,255,0.65) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid transparent",
  borderRadius: 24,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
} as const;

const headingGradient = {
  background: "linear-gradient(135deg,#06b6d4 10%,#8b5cf6 50%,#ec4899 90%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
} as const;

export default function SubscriptionPage() {
  const user        = useAuthStore((s) => s.user);
  const currentPlan = user?.subscription_plan ?? "free";

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const { data: subscription } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.get("/api/subscriptions/current").then((r) => r.data),
  });

  const checkoutMutation = useMutation({
    mutationFn: (priceId: string) =>
      api.post("/api/subscriptions/checkout", { price_id: priceId }).then((r) => r.data),
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setCheckoutError("Unable to start checkout. Please contact support@cuvr.ae");
      }
    },
    onError: () => {
      setCheckoutError("Unable to process upgrade. Please contact support@cuvr.ae to activate your plan.");
    },
  });

  const openBillingPortal = async () => {
    setBillingPortalLoading(true);
    try {
      const { data } = await api.post("/api/subscriptions/portal");
      window.location.href = data.portal_url;
    } catch {
      setBillingPortalLoading(false);
      setCheckoutError("Unable to open billing portal. Please contact support@cuvr.ae");
    }
  };

  const handleUpgrade = (planId: string, priceId: string) => {
    setCheckoutError(null);
    if (!priceId) {
      setCheckoutError("Checkout is not configured yet. Please contact support@cuvr.ae to activate your plan.");
      return;
    }
    checkoutMutation.mutate(priceId);
  };

  return (
    <div style={{ animation: "fadeIn 0.22s ease-out", maxWidth: 960 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          boxShadow: "0 4px 16px rgba(139,92,246,0.3)",
        }}>
          <ShoppingBag size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, ...headingGradient }}>
            Marketplace
          </h1>
          <p style={{ fontSize: 13, color: "#8b5cf6", margin: 0 }}>
            Choose the plan that fits your workflow
          </p>
        </div>
      </div>

      {/* Current plan banner */}
      {subscription && currentPlan !== "free" && (
        <div style={{
          ...glass, padding: "20px 24px", marginBottom: 28,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.1))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles size={20} color="#8b5cf6" />
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, margin: 0 }}>
                Active Plan
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, margin: "2px 0 4px", ...headingGradient }}>
                {getPlan(currentPlan)?.name ?? currentPlan}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: subscription.status === "active" ? "#22c55e" : "#ef4444",
                  boxShadow: subscription.status === "active" ? "0 0 6px rgba(34,197,94,0.5)" : "none",
                }} />
                <span style={{ fontSize: 12, color: subscription.status === "active" ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {subscription.status}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={openBillingPortal}
            disabled={billingPortalLoading}
            style={{
              padding: "10px 20px", borderRadius: 12, cursor: billingPortalLoading ? "not-allowed" : "pointer",
              backgroundImage: "linear-gradient(#fff,#fff), linear-gradient(135deg,#8b5cf6,#ec4899)",
              backgroundOrigin: "padding-box, border-box",
              backgroundClip: "padding-box, border-box",
              border: "1.5px solid transparent",
              color: "#8b5cf6", fontSize: 13, fontWeight: 700,
              opacity: billingPortalLoading ? 0.6 : 1,
            } as React.CSSProperties}
          >
            {billingPortalLoading ? "Opening…" : "Manage Billing"}
          </button>
        </div>
      )}

      {/* Plan heading */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a1d2e", margin: "0 0 4px" }}>
          {currentPlan === "free" ? "Choose a Plan" : "Change Plan"}
        </h2>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          Click a plan to select it, then click Upgrade. All plans include a 14-day free trial.
        </p>
      </div>

      {/* Error banner */}
      {checkoutError && (
        <div style={{
          marginBottom: 20, padding: "14px 20px", borderRadius: 14,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>{checkoutError}</p>
          <button onClick={() => setCheckoutError(null)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0,
          }}>×</button>
        </div>
      )}

      {/* Plan cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
        {PLANS.map((plan) => {
          const Icon     = planIcons[plan.id as keyof typeof planIcons] ?? Zap;
          const isCurrent  = plan.id === currentPlan;
          const isSelected = selectedPlan === plan.id;
          const isDark     = isSelected || (plan.id === "professional" && selectedPlan === null);
          const colors   = planColors[plan.id] ?? planColors.starter;

          return (
            <div
              key={plan.id}
              onClick={() => { if (!isCurrent) setSelectedPlan(plan.id); }}
              style={{
                position: "relative",
                background: isDark ? DARK_BG : "rgba(255,255,255,0.75) padding-box, linear-gradient(135deg,#8b5cf6,#ec4899) border-box",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderRadius: 24,
                border: isCurrent
                  ? `2px solid ${colors.accent}`
                  : isSelected
                  ? "2px solid #ec4899"
                  : isDark
                  ? "1px solid rgba(139,92,246,0.4)"
                  : "1.5px solid transparent",
                boxShadow: isSelected
                  ? "0 16px 48px rgba(236,72,153,0.3)"
                  : isDark
                  ? "0 16px 48px rgba(139,92,246,0.25)"
                  : isCurrent
                  ? `0 8px 32px ${colors.accent}30`
                  : "0 4px 24px rgba(0,0,0,0.06)",
                padding: 28,
                display: "flex", flexDirection: "column",
                marginTop: plan.id === "professional" ? 0 : 8,
                cursor: isCurrent ? "default" : "pointer",
                transition: "box-shadow 0.2s, border-color 0.2s, transform 0.2s",
              } as React.CSSProperties}
              {...tilt}
            >
              {/* Popular badge */}
              {plan.id === "professional" && !isSelected && selectedPlan === null && (
                <div style={{
                  position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                  padding: "4px 16px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff",
                  background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                  boxShadow: "0 4px 12px rgba(139,92,246,0.4)",
                  whiteSpace: "nowrap",
                }}>
                  ✦ Most Popular
                </div>
              )}

              {/* Selected badge */}
              {isSelected && (
                <div style={{
                  position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                  padding: "4px 16px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff",
                  background: "linear-gradient(135deg,#ec4899,#8b5cf6)",
                  boxShadow: "0 4px 12px rgba(236,72,153,0.5)",
                  whiteSpace: "nowrap",
                }}>
                  ✓ Selected
                </div>
              )}

              {/* Current badge */}
              {isCurrent && (
                <div style={{
                  position: "absolute", top: -12, right: 20,
                  padding: "3px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, color: "#fff",
                  background: "#22c55e",
                }}>
                  Active
                </div>
              )}

              {/* Icon + Name */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: `linear-gradient(135deg,${colors.from}22,${colors.to}22)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={20} color={colors.accent} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: isDark ? "#fff" : "#1a1d2e" }}>
                  {plan.name}
                </h3>
              </div>

              {/* Price */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: isDark ? "#fff" : "#1a1d2e", lineHeight: 1 }}>
                    ${plan.price}
                  </span>
                  <span style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.5)" : "#9ca3af", marginBottom: 4 }}>
                    /month
                  </span>
                </div>
              </div>

              {/* Features */}
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: isDark ? "rgba(139,92,246,0.3)" : `${colors.accent}18`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check size={10} color={isDark ? "#a78bfa" : colors.accent} strokeWidth={3} />
                    </div>
                    <span style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.85)" : "#374151", lineHeight: 1.5 }}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                disabled={isCurrent || checkoutMutation.isPending}
                onClick={(e) => { e.stopPropagation(); handleUpgrade(plan.id, plan.priceId); }}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 14, border: "none",
                  cursor: isCurrent || checkoutMutation.isPending ? "not-allowed" : "pointer",
                  background: isCurrent
                    ? "rgba(139,92,246,0.15)"
                    : isSelected
                    ? "linear-gradient(135deg,#ec4899,#8b5cf6)"
                    : `linear-gradient(135deg,${colors.from},${colors.to})`,
                  color: isCurrent ? (isDark ? "rgba(255,255,255,0.4)" : "#9ca3af") : "#fff",
                  fontSize: 14, fontWeight: 800,
                  boxShadow: !isCurrent ? (isSelected ? "0 6px 20px rgba(236,72,153,0.45)" : `0 4px 16px ${colors.accent}40`) : "none",
                  transition: "opacity 0.2s",
                  opacity: checkoutMutation.isPending ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                } as React.CSSProperties}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.opacity = "0.87"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {isCurrent
                  ? "Current Plan"
                  : checkoutMutation.isPending
                  ? "Processing…"
                  : <>{isSelected ? "Confirm Upgrade" : `Upgrade to ${plan.name}`} <ArrowRight size={14} /></>}
              </button>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 28 }}>
        All prices in USD. Cancel anytime. Questions?{" "}
        <a href="mailto:support@cuvr.ae" style={{ color: "#8b5cf6", textDecoration: "none", fontWeight: 600 }}>
          Contact us
        </a>
      </p>
    </div>
  );
}
