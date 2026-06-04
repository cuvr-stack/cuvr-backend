import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useSessionTimeout } from "@/lib/useSessionTimeout";

export default function DashboardLayout() {
  useSessionTimeout();
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      background: "#edf0fb",
      position: "fixed",
      top: 0,
      left: 0,
    }}>
      <Sidebar />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>
        <TopBar />
        <main style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0,
          padding: "24px",
          background: "linear-gradient(135deg, #edf0fb 0%, #f3effe 40%, #fceef8 100%)",
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
