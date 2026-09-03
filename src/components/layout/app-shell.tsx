import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { Maximize2, Minimize2, PanelLeftClose, PanelRight, PictureInPicture2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AgentPanel } from "./agent-panel";
import { EjectedPanel } from "@/components/agent/ejected-panel";
import { useEject } from "@/components/agent/use-eject";
import { isTauriRuntime, PANE_BG, PANE_BG_RAISED, PaneResizeEdges, useWindowDrag, WindowResizeHandles } from "./window-chrome";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider, SHELL_COMMAND_EVENT, type ShellCommand } from "./command-palette";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createRouteConversationContext, publishConversationContext } from "@/lib/conversation-context";
import { HomePinSync } from "@/components/home/home-pin-sync";
import { useEngineBoot } from "@/engine/use-engine";
import { recoverInterruptedLocalWorkflowsOnLaunch } from "@/services/workflow-recovery";
import { AGENT_PANEL_OPEN_EVENT, readAgentPanelCollapsed } from "@/lib/agent-panel-persistence";
import { useSessionStore } from "@/engine/session-store";
import { useWindowSize } from "@/lib/use-window-size";
import { discoverAcpProviders, reconnectAcpProviders } from "@/engine/acp-registry";
import { readPreference, RECONNECT_ON_LAUNCH_KEY, SCAN_ON_LAUNCH_KEY } from "@/lib/settings-preferences";

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

function readAgentPanelHidden() {
  if (typeof window === "undefined") return false;
  try {
    return readAgentPanelCollapsed(window.localStorage) ?? window.innerWidth < 1100;
  } catch {
    return false;
  }
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}

export function AppShell() {
  useEngineBoot();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { ejected: agentPanelDetached, busy: agentPanelEjecting, eject, redock } = useEject();
  const [focusMode, setFocusMode] = useState(() => readFlag(FOCUS_MODE_KEY));
  const [sidebarKey, setSidebarKey] = useState(0);
  const [agentPanelOpenRequest, setAgentPanelOpenRequest] = useState(0);
  const [agentPanelToggleRequest, setAgentPanelToggleRequest] = useState(0);
  const [agentPanelHidden, setAgentPanelHidden] = useState(readAgentPanelHidden);
  const roomOpen = useSessionStore((state) => Boolean(state.selectedRoomId));
  const { isNarrow } = useWindowSize();

  useEffect(() => writeFlag(FOCUS_MODE_KEY, focusMode), [focusMode]);

  useEffect(() => {
    if (!isTauriRuntime || readPreference(SCAN_ON_LAUNCH_KEY, "1") === "0") return;
    void queryClient.prefetchQuery({
      queryKey: ["settings", "acp-providers"],
      queryFn: discoverAcpProviders,
      staleTime: 15_000,
    });
  }, [queryClient]);

  useEffect(() => {
    if (!isTauriRuntime || readPreference(RECONNECT_ON_LAUNCH_KEY, "1") === "0") return;
    void reconnectAcpProviders().then(
      () => queryClient.invalidateQueries({ queryKey: ["settings", "acp-statuses"] }),
      (error) => console.warn("ACP reconnect failed", error),
    );
  }, [queryClient]);

  useEffect(() => {
    const open = () => {
      setAgentPanelHidden(false);
      if (agentPanelDetached) {
        redock();
        setFocusMode(false);
        setAgentPanelOpenRequest((request) => request + 1);
        return;
      }
      setFocusMode(false);
      setAgentPanelOpenRequest((request) => request + 1);
    };
    window.addEventListener(AGENT_PANEL_OPEN_EVENT, open);
    return () => window.removeEventListener(AGENT_PANEL_OPEN_EVENT, open);
  }, [agentPanelDetached, redock]);

  const toggleFocusMode = useCallback(() => setFocusMode((on) => !on), []);
  const toggleSidebar = useCallback(() => {
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
  }, []);

  // Shell shortcuts: ⌘⇧F focus mode, ⌘\ sidebar, Escape or ⌘⇧A leaves focus. The
  // palette dispatches the same commands as a custom event.
  useEffect(() => {
    const run = (command: ShellCommand) => {
      if (command === "focus-mode") toggleFocusMode();
      else toggleSidebar();
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
  }, [toggleFocusMode, toggleSidebar]);

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
        className={cn("app-shell flex h-dvh min-h-0", !isTauriRuntime && "browser-shell")}
        // Non-zero alpha keeps the transparent gutters hit-testable on macOS
        // without painting a visible outline around the window.
        style={isTauriRuntime ? { background: "rgba(0,0,0,0.001)" } : undefined}
      >
        {!focusMode && <Sidebar key={sidebarKey} />}
        <main
          className="pane relative flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{ background: PANE_BG }}
        >
          {/* Native macOS traffic lights live over the sidebar. This strip is
              only a drag surface and a home for window-level actions. */}
          <div
            onMouseDown={dragWindow}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              if (!isTauriRuntime) return;
              void getCurrentWindow().toggleMaximize();
            }}
            className={cn("window-strip flex h-[34px] shrink-0 cursor-default items-center", focusMode && "pl-[78px]")}
            data-tauri-drag-region
          >
            {focusMode && (
              <span className="t-count uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                ⌘⇧F to leave focus
              </span>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-0.5 pr-3 text-[var(--overlay-1)]">
              <ChromeButton label="Toggle sidebar" onClick={toggleSidebar}>
                <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.5} />
              </ChromeButton>
              <ChromeButton label="Focus mode" pressed={focusMode} onClick={toggleFocusMode}>
                <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </ChromeButton>
              <ChromeButton
                label={agentPanelHidden ? "Show agent panel" : "Hide agent panel"}
                pressed={!agentPanelHidden}
                onClick={() => setAgentPanelToggleRequest((request) => request + 1)}
                disabled={agentPanelDetached}
              >
                <PanelRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </ChromeButton>
              {!agentPanelHidden && !agentPanelDetached ? (
                <>
                  <ChromeButton
                    label="Eject agent panel"
                    onClick={() => eject(false)}
                    disabled={agentPanelEjecting || roomOpen}
                  >
                    <PictureInPicture2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </ChromeButton>
                  <ChromeButton
                    label="Reduce agent panel to HUD"
                    onClick={() => eject(true)}
                    disabled={agentPanelEjecting || roomOpen}
                  >
                    <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </ChromeButton>
                </>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
          <PaneResizeEdges west east />
        </main>
        {focusMode || isNarrow ? null : agentPanelDetached ? (
          <button
            type="button"
            onClick={() => eject()}
            aria-label="Focus ejected agent panel"
            title="Focus ejected agent panel"
            className={cn(
              "pane flex h-auto w-12 shrink-0 flex-col items-center self-start rounded-[var(--r-pill)] py-3",
              "text-[var(--overlay-1)] transition-colors hover:text-[var(--text)]",
            )}
            style={{ background: PANE_BG_RAISED }}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        ) : (
          <AgentPanel
            onEject={() => eject()}
            onCollapsedChange={setAgentPanelHidden}
            openRequest={agentPanelOpenRequest}
            toggleRequest={agentPanelToggleRequest}
          />
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

function ChromeButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-pill)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

export function AgentPanelWindow() {
  useEngineBoot();
  return (
    <>
      <EjectedPanel />
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
