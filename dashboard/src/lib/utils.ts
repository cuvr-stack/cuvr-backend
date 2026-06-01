import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

const PROD_API = "https://api.cuvr.ae";

/**
 * Normalise a backend asset URL for the current environment.
 *
 * - In development: strip the localhost origin so the request goes via the
 *   Vite proxy (avoids CORS).
 * - In production: ensure the URL uses the public API domain. If for any
 *   reason the DB still has a localhost URL, rewrite it to the real domain.
 */
export function assetUrl(url: string | undefined | null): string {
  if (!url) return "";

  // Already a fully-qualified production URL — return as-is
  if (url.startsWith(PROD_API)) return url;

  // Rewrite any localhost URL
  if (/^https?:\/\/localhost(:\d+)?/.test(url)) {
    const path = url.replace(/^https?:\/\/localhost(:\d+)?/, "");
    // In dev (Vite running), keep as relative path so the proxy handles it
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return path;
    }
    // In production, point at the real API
    return `${PROD_API}${path}`;
  }

  // Relative path already (e.g. /uploads/...) — return as-is
  return url;
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}
