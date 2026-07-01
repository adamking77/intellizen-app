import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { AgentPanel } from "./agent-panel";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider } from "./command-palette";

export function AppShell() {
  return (
    <CommandPaletteProvider>
      <div className="flex h-dvh min-h-0 bg-[var(--base)]">
        <Sidebar />
        <main className="relative flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </main>
        <AgentPanel />
      </div>
      <Toaster
        position="bottom-right"
        theme="dark"
        closeButton
        toastOptions={{
          style: {
            background: "var(--mantle)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontFamily: "var(--font-ui, inherit)",
            fontSize: "13px",
          },
          className: "intelizen-toast",
        }}
      />
    </CommandPaletteProvider>
  );
}
