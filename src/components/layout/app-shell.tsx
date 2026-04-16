import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider } from "./command-palette";

export function AppShell() {
  return (
    <CommandPaletteProvider>
      <div className="relative flex h-dvh min-h-0 flex-col bg-[var(--base)]">
        <div
          data-tauri-drag-region
          className="h-10 shrink-0 border-b border-[var(--border)] bg-[var(--mantle)]"
        />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="relative flex-1 min-w-0 overflow-x-hidden overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster
        position="bottom-right"
        theme="dark"
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
