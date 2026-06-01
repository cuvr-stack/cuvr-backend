import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  /** Session timeout in minutes. null = never time out. */
  sessionTimeoutMinutes: number | null;
  setSessionTimeout: (minutes: number | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sessionTimeoutMinutes: 30,
      setSessionTimeout: (minutes) => set({ sessionTimeoutMinutes: minutes }),
    }),
    { name: "cuvr-settings" }
  )
);
