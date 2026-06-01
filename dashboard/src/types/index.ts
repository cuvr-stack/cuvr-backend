export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  created_at: string;
}

export type SubscriptionPlan = "free" | "starter" | "professional" | "enterprise";
export type SubscriptionStatus = "active" | "inactive" | "cancelled" | "past_due" | "trialing";

export interface PlanConfig {
  id: SubscriptionPlan;
  name: string;
  price: number;
  priceId: string;
  features: string[];
  limits: {
    properties: number;
    photosPerProperty: number;
    toursPerMonth: number;
    storageGB: number;
  };
}

export interface Property {
  id: string;
  user_id: string;
  name: string;
  address: string;
  description?: string;
  property_type: PropertyType;
  status: PropertyStatus;
  photo_count: number;
  tour_count: number;
  created_at: string;
  updated_at: string;
}

export type PropertyType = "apartment" | "house" | "villa" | "commercial" | "land";
export type PropertyStatus = "active" | "archived";

export interface Photo {
  id: string;
  property_id: string;
  original_url: string;
  depth_map_url?: string;
  mesh_url?: string;
  thumbnail_url?: string;
  filename: string;
  processing_status: ProcessingStatus;
  processing_progress: number;
  error_message?: string;
  room_label?: string;
  created_at: string;
}

export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

export interface Tour {
  id: string;
  property_id: string;
  name: string;
  description?: string;
  scenes: TourScene[];
  share_token?: string;
  share_code?: string;
  share_url?: string;
  is_public: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface TourScene {
  id: string;
  photo_id: string;
  photo: Photo;
  order: number;
  label: string;
  hotspots: Hotspot[];
}

export interface Hotspot {
  id: string;
  x: number;
  y: number;
  z: number;
  target_scene_id: string;
  label: string;
}

export interface Video {
  id: string;
  property_id: string;
  filename: string;
  original_url: string;
  splat_url?: string;
  thumbnail_url?: string;
  status: "pending" | "extracting" | "processing" | "ready" | "failed";
  progress: number;
  error_message?: string;
  file_size_bytes?: number;
  duration_seconds?: number;
  created_at: string;
}

export interface Job {
  id: string;
  photo_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
  created_at: string;
}

export interface ApiError {
  detail: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
