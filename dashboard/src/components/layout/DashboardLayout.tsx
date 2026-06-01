import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useSessionTimeout } from "@/lib/useSessionTimeout";

export default function DashboardLayout() {
  useSessionTimeout();
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#edf0fb" }}>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main
          className="flex-1 overflow-y-auto p-6"
          style={{
            background:
              "linear-gradient(135deg, #edf0fb 0%, #f3effe 40%, #fceef8 100%)",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
