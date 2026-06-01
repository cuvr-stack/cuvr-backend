import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";

export function useSocialAuth() {
  const navigate = useNavigate();
  const { fetchMe } = useAuthStore();

  const handleTokenResponse = async (data: { access_token: string; refresh_token: string }) => {
    useAuthStore.setState({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      isAuthenticated: true,
    });
    await fetchMe();
    navigate("/dashboard");
  };

  const loginWithGoogle = async (credential: string) => {
    const { data } = await api.post("/api/auth/google", { credential });
    await handleTokenResponse(data);
  };

  const loginWithApple = async (identityToken: string, fullName?: string) => {
    const { data } = await api.post("/api/auth/apple", {
      identity_token: identityToken,
      full_name: fullName,
    });
    await handleTokenResponse(data);
  };

  return { loginWithGoogle, loginWithApple };
}
