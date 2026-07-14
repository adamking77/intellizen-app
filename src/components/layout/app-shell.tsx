import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { PanelRight, PictureInPicture2 } from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AgentPanel } from "./agent-panel";
import { isTauriRuntime, PANE_BG, PANE_BG_RAISED, PaneResizeEdges, TrafficLights, useWindowDrag, WindowResizeHandles } from "./window-chrome";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider } from "./command-palette";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createRouteConversationContext, publishConversationContext } from "@/lib/conversation-context";

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
  const location = useLocation();
  const [agentPanelDetached, setAgentPanelDetached] = useState(() => readAgentPanelDetached());

  useEffect(() => {
    publishConversationContext(createRouteConversationContext(location));
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    const syncDetachedState = () => setAgentPanelDetached(readAgentPanelDetached());
    window.addEventListener("storage", syncDetachedState);
    window.addEventListener("focus", syncDetachedState);
    return () => {
      window.removeEventListener("storage", syncDetachedState);
      window.removeEventListener("focus", syncDetachedState);
    };
  }, []);

  // Recover from a stale detached flag (app relaunched while the flag was
  // set, or the panel window died without an event reaching us).
  useEffect(() => {
    if (!isTauriRuntime || !agentPanelDetached) return;
    void WebviewWindow.getByLabel(AGENT_PANEL_WINDOW_LABEL).then((existing) => {
      if (!existing) {
        writeAgentPanelDetached(false);
        setAgentPanelDetached(false);
      }
    });
  }, [agentPanelDetached]);

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
        minHeight: 560,
        resizable: true,
        focus: true,
        alwaysOnTop: true,
        decorations: false,
        transparent: true,
        backgroundColor: "#00000000",
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

  const dragWindow = useWindowDrag();

  return (
    <CommandPaletteProvider>
      {/* Clicks landing on the transparent gutters (this element itself, not
          a pane) move the window. */}
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dragWindow(event);
        }}
        className={cn("flex h-dvh min-h-0 gap-2 p-2", !isTauriRuntime && "bg-[var(--crust)]")}
        // 1% alpha keeps the gutters hit-testable for window dragging while
        // staying visually transparent.
        style={isTauriRuntime ? { background: "rgba(0,0,0,0.01)" } : undefined}
      >
        <Sidebar />
        <main
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)]"
          style={{ background: PANE_BG }}
        >
          {/* Window chrome strip: traffic lights + drag surface, sogo-style,
              inside the main pane. */}
          <div
            onMouseDown={dragWindow}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              if (!isTauriRuntime) return;
              void getCurrentWindow().toggleMaximize();
            }}
            className="flex h-9 shrink-0 cursor-default items-center border-b border-[var(--border)]"
          >
            <TrafficLights className="pl-4 pr-3" />
          </div>
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
          <PaneResizeEdges west east />
        </main>
        {agentPanelDetached ? (
          <button
            type="button"
            onClick={() => void ejectAgentPanel()}
            aria-label="Focus ejected agent panel"
            title="Focus ejected agent panel"
            className={cn(
              "flex h-auto w-12 shrink-0 flex-col items-center self-start rounded-[28px] border border-[var(--border)] py-3",
              "text-[var(--overlay-1)] shadow-[0_18px_44px_-24px_rgba(0,0,0,0.75)] transition-colors hover:text-[var(--text)]",
            )}
            style={{ background: PANE_BG_RAISED }}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        ) : (
          <AgentPanel onEject={() => void ejectAgentPanel()} />
        )}
      </div>
      <WindowResizeHandles />
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
  function redock() {
    writeAgentPanelDetached(false);
    void getCurrentWindow()
      .close()
      .catch((err) => toastError("Could not re-dock panel", err));
  }

  const dragWindow = useWindowDrag();

  return (
    <div className="relative flex h-dvh min-h-0 flex-col bg-transparent p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]">
        {/* Frameless floating window: this strip is its title bar. */}
        <div
          onMouseDown={dragWindow}
          className="flex h-9 shrink-0 cursor-default items-center justify-between border-b border-[var(--border)] pl-3 pr-2"
        >
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--overlay-1)]">
            Agent Panel
          </span>
          <button
            type="button"
            onClick={redock}
            aria-label="Attach agent panel to main window"
            title="Attach to main window"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <AgentPanel mode="standalone" />
        </div>
      </div>
      <WindowResizeHandles />
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
    </div>
  );
}
