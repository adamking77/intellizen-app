import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { PictureInPicture2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AgentPanel } from "./agent-panel";
import { EjectedPanel } from "@/components/agent/ejected-panel";
import { useEject } from "@/components/agent/use-eject";
import { isTauriRuntime, PANE_BG, PANE_BG_RAISED, PaneResizeEdges, TrafficLights, useWindowDrag, WindowResizeHandles } from "./window-chrome";
import { Sidebar } from "./sidebar";
import { CommandPaletteProvider, SHELL_COMMAND_EVENT, type ShellCommand } from "./command-palette";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createRouteConversationContext, publishConversationContext } from "@/lib/conversation-context";
import { HomePinSync } from "@/components/home/home-pin-sync";
import { useEngineBoot } from "@/engine/use-engine";
import { recoverInterruptedLocalWorkflowsOnLaunch } from "@/services/workflow-recovery";

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

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}

export function AppShell() {
  useEngineBoot();
  const location = useLocation();
  const { ejected: agentPanelDetached, eject } = useEject();
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
            onClick={() => eject()}
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
          <AgentPanel onEject={() => eject()} />
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
