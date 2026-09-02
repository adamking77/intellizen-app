import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { PanelRight, PictureInPicture2 } from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AgentPanel } from "./agent-panel";
import { isTauriRuntime, PANE_BG, PANE_BG_RAISED, PaneResizeEdges, TrafficLights, useWindowDrag, WindowResizeHandles } from "./window-chrome";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider, SHELL_COMMAND_EVENT, type ShellCommand } from "./command-palette";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createRouteConversationContext, publishConversationContext } from "@/lib/conversation-context";
import { HomePinSync } from "@/components/home/home-pin-sync";
import { recoverInterruptedLocalWorkflowsOnLaunch } from "@/services/workflow-recovery";

const AGENT_PANEL_WINDOW_LABEL = "agent-panel";
const AGENT_PANEL_DETACHED_KEY = "intelizen:agent-panel-detached";
const FOCUS_MODE_KEY = "intelizen:focus-mode";
// Owned by sidebar.tsx; ⌘\ writes it and remounts the sidebar so it re-reads.
const SIDEBAR_COLLAPSED_KEY = "intelizen:sidebar-collapsed";

function readFlag(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const readAgentPanelDetached = () => readFlag(AGENT_PANEL_DETACHED_KEY);
const writeAgentPanelDetached = (detached: boolean) => writeFlag(AGENT_PANEL_DETACHED_KEY, detached);

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}

export function AppShell() {
  const location = useLocation();
  const [agentPanelDetached, setAgentPanelDetached] = useState(() => readAgentPanelDetached());
  const [focusMode, setFocusMode] = useState(() => readFlag(FOCUS_MODE_KEY));
  const [sidebarKey, setSidebarKey] = useState(0);

  useEffect(() => writeFlag(FOCUS_MODE_KEY, focusMode), [focusMode]);

  // Shell shortcuts: ⌘⇧F focus mode, ⌘\ sidebar, Escape or ⌘⇧A leaves focus. The
  // palette dispatches the same commands as a custom event.
  useEffect(() => {
    const run = (command: ShellCommand) => {
      if (command === "focus-mode") {
        setFocusMode((on) => !on);
        return;
      }
      let collapsed = false;
      try {
        const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        // No explicit choice: sidebar.tsx auto-collapses when cramped (<1100).
        collapsed = raw === null ? window.innerWidth < 1100 : raw === "1";
      } catch {
        /* ignore */
      }
      writeFlag(SIDEBAR_COLLAPSED_KEY, !collapsed);
      setSidebarKey((k) => k + 1);
    };
    const onCommand = (event: Event) => run((event as CustomEvent<ShellCommand>).detail);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        run("focus-mode");
      } else if (mod && event.key === "\\") {
        event.preventDefault();
        run("toggle-sidebar");
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "a") {
        // The agent panel is unmounted in focus mode, so its own ⌘⇧A
        // handler is not listening; leave focus mode so the next press lands.
        setFocusMode(false);
      } else if (event.key === "Escape") {
        setFocusMode(false);
      }
    };
    window.addEventListener(SHELL_COMMAND_EVENT, onCommand);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(SHELL_COMMAND_EVENT, onCommand);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    publishConversationContext(createRouteConversationContext(location));
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    void recoverInterruptedLocalWorkflowsOnLaunch()
      .then((report) => {
        if (report.abandoned.length) {
          toast.info("Interrupted local workflow recovered", {
            description: `${report.abandoned.length} run${report.abandoned.length === 1 ? "" : "s"} marked abandoned with receipts; none were retried.`,
          });
        }
        if (report.failures.length) {
          toast.error("Workflow recovery needs attention", {
            description: `${report.failures.length} run${report.failures.length === 1 ? "" : "s"} could not be reconciled.`,
          });
        }
      })
      .catch((error) => toastError("Workflow recovery failed", error));
  }, []);

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
        shadow: false,
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
      <HomePinSync />
      {/* Clicks landing on the transparent gutters (this element itself, not
          a pane) move the window. */}
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dragWindow(event);
        }}
        className={cn("app-shell flex h-dvh min-h-0 gap-2 p-2", !isTauriRuntime && "bg-[var(--crust)]")}
        // Non-zero alpha keeps the transparent gutters hit-testable on macOS
        // without painting a visible outline around the window.
        style={isTauriRuntime ? { background: "rgba(0,0,0,0.001)" } : undefined}
      >
        {!focusMode && <Sidebar key={sidebarKey} />}
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
            {focusMode && (
              <span className="font-ui text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                ⌘⇧F to leave focus
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
          <PaneResizeEdges west east />
        </main>
        {focusMode ? null : agentPanelDetached ? (
          <button
            type="button"
            onClick={() => void ejectAgentPanel()}
            aria-label="Focus ejected agent panel"
            title="Focus ejected agent panel"
            className={cn(
              "flex h-auto w-12 shrink-0 flex-col items-center self-start rounded-[28px] border border-[var(--border)] py-3",
              "text-[var(--overlay-1)] transition-colors hover:text-[var(--text)]",
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)]">
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
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
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
