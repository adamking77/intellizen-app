import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";

export function AppShell() {
  return (
    <div className="flex h-dvh min-h-0 bg-[var(--background)]">
      <Sidebar />
      <main className="relative flex-1 min-w-0 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
