import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import DashboardLayout from "@/components/layout/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardHome from "@/pages/DashboardHome";
import PropertiesPage from "@/pages/PropertiesPage";
import PropertyDetailPage from "@/pages/PropertyDetailPage";
import UploadPage from "@/pages/UploadPage";
import TourBuilderPage from "@/pages/TourBuilderPage";
import SubscriptionPage from "@/pages/SubscriptionPage";
import SettingsPage from "@/pages/SettingsPage";
import ToursPage from "@/pages/ToursPage";
import VRTourViewer from "@/pages/VRTourViewer";
import VideoUploadPage from "@/pages/VideoUploadPage";
import VirtualStagingPage from "@/pages/VirtualStagingPage";
import SketchRenderPage from "@/pages/SketchRenderPage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";
import FloorPlanUploadPage from "@/pages/FloorPlanUploadPage";
import TeamPage from "@/pages/TeamPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Public VR tour viewer — no auth required */}
      <Route path="/vr/tour/:token" element={<VRTourViewer />} />

      <Route path="/dashboard" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
        <Route index element={<DashboardHome />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="properties/:id" element={<PropertyDetailPage />} />
        <Route path="properties/:id/upload" element={<UploadPage />} />
        <Route path="properties/:id/tour-builder" element={<TourBuilderPage />} />
        <Route path="properties/:id/upload-video" element={<VideoUploadPage />} />
        <Route path="properties/:id/floor-plan" element={<FloorPlanUploadPage />} />
        <Route path="properties/:id/virtual-staging" element={<VirtualStagingPage />} />
        <Route path="properties/:id/sketch-render" element={<SketchRenderPage />} />
        <Route path="tours" element={<ToursPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
