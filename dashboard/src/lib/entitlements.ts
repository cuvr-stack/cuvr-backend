// ── Feature flag constants ────────────────────────────────────────────────────
export const FEATURES = {
  RENDER_3D:       "feat_render_3d",
  WALKTHROUGH:     "feat_walkthrough",
  VIRTUAL_STAGING: "feat_virtual_staging",
  FLOOR_PLAN:      "feat_floor_plan",
  SKETCH_RENDER:   "feat_sketch_render",
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

export interface Entitlement {
  id: string;
  code: string;
  property_id: string;
  feat_render_3d: boolean;
  feat_walkthrough: boolean;
  feat_virtual_staging: boolean;
  feat_floor_plan: boolean;
  feat_sketch_render: boolean;
  package_name: string | null;
  status: "active" | "suspended" | "expired";
  notes: string | null;
  expires_at: string | null;
  created_at: string;
}

// ── Package presets (for team reference) ─────────────────────────────────────
export const PACKAGES = [
  {
    id: "base",
    name: "Base Package",
    price: "AED 30,000",
    description: "Core 3D environment + standard asset library",
    features: { feat_render_3d: true,  feat_walkthrough: false, feat_virtual_staging: false, feat_floor_plan: false, feat_sketch_render: false },
  },
  {
    id: "standard",
    name: "Standard Package",
    price: "AED 35,000",
    description: "3D environment + VR walkthrough",
    features: { feat_render_3d: true,  feat_walkthrough: true,  feat_virtual_staging: false, feat_floor_plan: false, feat_sketch_render: false },
  },
  {
    id: "full",
    name: "Full Package",
    price: "AED 45,000+",
    description: "Complete suite — all features enabled",
    features: { feat_render_3d: true,  feat_walkthrough: true,  feat_virtual_staging: true,  feat_floor_plan: true,  feat_sketch_render: true  },
  },
];

// ── Helper: check if a specific feature is active ────────────────────────────
export function hasFeature(ent: Entitlement | null | undefined, feature: FeatureKey): boolean {
  if (!ent || ent.status !== "active") return false;
  if (ent.expires_at && new Date(ent.expires_at) < new Date()) return false;
  return !!ent[feature as keyof Entitlement];
}
