import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";
import { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        const { data } = await api.post("/api/auth/login", { email, password });
        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isAuthenticated: true,
          isLoading: false,
        });
        await get().fetchMe();
      },

      register: async (email, password, fullName) => {
        set({ isLoading: true });
        try {
          await api.post("/api/auth/register", {
            email,
            password,
            full_name: fullName,
          });
        } finally {
          set({ isLoading: false });
        }
        // No tokens yet — user must verify email first
      },

      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      refresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) throw new Error("No refresh token");
        const { data } = await api.post("/api/auth/refresh", { refresh_token: refreshToken });
        set({ accessToken: data.access_token, refreshToken: data.refresh_token });
      },

      fetchMe: async () => {
        const { data } = await api.get<User>("/api/auth/me");
        set({ user: data });
      },
    }),
    {
      name: "cuvr-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  )
);
