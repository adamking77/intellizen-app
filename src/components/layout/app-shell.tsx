import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider } from "./command-palette";

export function AppShell() {
  return (
    <CommandPaletteProvider>
      <div className="flex h-dvh min-h-0 bg-[var(--base)]">
        <Sidebar />
        <main className="relative flex-1 min-w-0 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </CommandPaletteProvider>
  );
}
