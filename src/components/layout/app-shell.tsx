import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { PanelRightOpen } from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AgentPanel } from "./agent-panel";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider } from "./command-palette";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

const AGENT_PANEL_WINDOW_LABEL = "agent-panel";
const AGENT_PANEL_DETACHED_KEY = "intelizen:agent-panel-detached";

function readAgentPanelDetached() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AGENT_PANEL_DETACHED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAgentPanelDetached(detached: boolean) {
  try {
    window.localStorage.setItem(AGENT_PANEL_DETACHED_KEY, detached ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function AppShell() {
  const [agentPanelDetached, setAgentPanelDetached] = useState(() => readAgentPanelDetached());

  useEffect(() => {
    const syncDetachedState = () => setAgentPanelDetached(readAgentPanelDetached());
    window.addEventListener("storage", syncDetachedState);
    window.addEventListener("focus", syncDetachedState);
    return () => {
      window.removeEventListener("storage", syncDetachedState);
      window.removeEventListener("focus", syncDetachedState);
    };
  }, []);

  async function ejectAgentPanel() {
    try {
      const existing = await WebviewWindow.getByLabel(AGENT_PANEL_WINDOW_LABEL);
      if (existing) {
        writeAgentPanelDetached(true);
        setAgentPanelDetached(true);
        await existing.setFocus();
        return;
      }

      const panelWindow = new WebviewWindow(AGENT_PANEL_WINDOW_LABEL, {
        url: "/agent-panel",
        title: "Agent Panel",
        width: 420,
        height: 820,
        minWidth: 360,
        minHeight: 640,
        resizable: true,
        focus: true,
        alwaysOnTop: true,
        decorations: true,
        backgroundColor: "#181825",
      });

      panelWindow.once("tauri://created", () => {
        writeAgentPanelDetached(true);
        setAgentPanelDetached(true);
        void panelWindow.setAlwaysOnTop(true);
      });
      panelWindow.once("tauri://destroyed", () => {
        writeAgentPanelDetached(false);
        setAgentPanelDetached(false);
      });
      panelWindow.once("tauri://error", (event) => {
        writeAgentPanelDetached(false);
        setAgentPanelDetached(false);
        toastError("Could not eject agent panel", event.payload);
      });
    } catch (err) {
      toastError("Could not eject agent panel", err);
    }
  }

  return (
    <CommandPaletteProvider>
      <div className="flex h-dvh min-h-0 gap-2 bg-[var(--crust)] p-2">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--base)]">
          <Outlet />
        </main>
        {agentPanelDetached ? (
          <button
            type="button"
            onClick={() => void ejectAgentPanel()}
            aria-label="Focus ejected agent panel"
            title="Focus ejected agent panel"
            className={cn(
              "flex h-full w-12 shrink-0 items-start justify-center rounded-xl border border-[var(--border)] bg-[var(--mantle)] pt-3",
              "text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
            )}
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        ) : (
          <AgentPanel onEject={() => void ejectAgentPanel()} />
        )}
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

export function AgentPanelWindow() {
  return (
    <>
      <AgentPanel mode="standalone" />
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
    </>
  );
}
