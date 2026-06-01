import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * Automatically logs the user out after a configurable period of inactivity.
 * Mount once in DashboardLayout — it will no-op when the user is not logged in
 * or when timeout is set to null (Never).
 */
export function useSessionTimeout() {
  const logout          = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const timeoutMinutes  = useSettingsStore((s) => s.sessionTimeoutMinutes);
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !timeoutMinutes) return;

    const ms = timeoutMinutes * 60 * 1000;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => logout(), ms);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // kick off the first timer

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [isAuthenticated, timeoutMinutes, logout]);
}
