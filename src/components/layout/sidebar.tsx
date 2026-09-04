import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import appPackage from "../../../package.json";
import {
  Database,
  FileText,
  FolderTree,
  House,
  LayoutGrid,
  Network,
  Settings,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { PaneResizeEdges, useWindowDrag } from "@/components/layout/window-chrome";
import { WorkspaceTree } from "@/components/layout/workspace-tree";
import { describeEngine, deriveEngineTag, useEngineStore, type EngineTag } from "@/engine/engine-store";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { PluginSidebarEntries } from "@/plugins/sidebar-entries";

type PlaceItem = { label: string; to: string; icon: LucideIcon; shortcut: string };

// Observational and orchestration surfaces belong on Home as widgets. Inbox
// and Monitors are retired in favor of Fiona's daily brief; Agent Work,
// Agent Work and Roles are represented by database-backed Home views.
export const PLACE_ITEMS: PlaceItem[] = [
  { label: "Home", to: "/home", icon: House, shortcut: "⌘1" },
  { label: "Databases", to: "/databases", icon: Database, shortcut: "⌘2" },
  { label: "Docs", to: "/docs", icon: FileText, shortcut: "⌘3" },
  { label: "Graph", to: "/graph", icon: Network, shortcut: "⌘4" },
  { label: "Canvas", to: "/canvas", icon: LayoutGrid, shortcut: "⌘5" },
  { label: "Workflows", to: "/workflows", icon: Workflow, shortcut: "⌘6" },
  { label: "Agents", to: "/agents", icon: UsersRound, shortcut: "⌘7" },
  { label: "Settings", to: "/settings", icon: Settings, shortcut: "⌘8" },
];

export function placeRouteForShortcut(key: string) {
  return PLACE_ITEMS[Number(key) - 1]?.to;
}

const APP_VERSION = `v${appPackage.version}`;
// Donor: hermes-app tokens.css `.tag` / `.tag.ok` — 11px, 1px 8px, pill.
const ENGINE_TAG_CLASS: Record<EngineTag, string> = {
  connected: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]",
  "pin mismatch": "bg-[color-mix(in_srgb,var(--wait)_14%,transparent)] text-[var(--wait)]",
  "starting…": "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext-0)]",
  offline: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-[var(--danger)]",
};
const ENGINE_DOT_CLASS: Record<EngineTag, string> = {
  connected: "bg-[var(--success)]",
  "pin mismatch": "bg-[var(--wait)]",
  "starting…": "bg-[var(--subtext-0)]",
  offline: "bg-[var(--danger)]",
};
const STORAGE_KEY = "intelizen:sidebar-collapsed";
const WIDTH_EXPANDED = 216;
const WIDTH_COLLAPSED = 56;

function AppMark({ size }: { size: number }) {
  return (
    <span aria-hidden className="app-mark shrink-0" style={{ width: size, height: size }} />
  );
}

function readCollapsed(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null; // no explicit choice — follow the cramped auto-collapse
  } catch {
    return null;
  }
}

export function Sidebar() {
  const navigate = useNavigate();
  const dragWindow = useWindowDrag();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const { isCramped } = useWindowSize();

  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() => readCollapsed());
  const engineConnection = useEngineStore((state) => state.connection);
  const engineInfo = useEngineStore((state) => state.info);
  const engineError = useEngineStore((state) => state.error);
  const pinCompatible = useEngineStore((state) => state.pinCompatible);
  const engineTag = deriveEngineTag({ connection: engineConnection, error: engineError, pinCompatible });
  const engineTitle = `${describeEngine({ connection: engineConnection, info: engineInfo, error: engineError, pinCompatible })} · IntelliZen ${APP_VERSION}`;
  // Explicit user choice wins; otherwise auto-collapse when cramped.
  const collapsed = userCollapsed ?? isCramped;

  useEffect(() => {
    if (userCollapsed === null) return;
    try {
      localStorage.setItem(STORAGE_KEY, userCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [userCollapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
      const route = placeRouteForShortcut(event.key);
      if (!route) return;
      event.preventDefault();
      navigate(route);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const toggle = () => setUserCollapsed(!collapsed);
  return (
    <aside
      style={{
        width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED,
        background: "var(--crust)",
      }}
      className={cn(
        "pane relative z-10 flex shrink-0 flex-col overflow-hidden",
        "transition-[width] duration-[var(--t-slow)] ease-[var(--ease-out)]",
        collapsed ? "sidebar-collapsed" : "h-full",
      )}
    >
      {/* Empty by design: macOS owns the first 78px and paints its native
          traffic lights here. The remainder stays draggable. */}
      <div className="sidebar-titlebar-clearance shrink-0" data-tauri-drag-region aria-hidden />
      {/* Header */}
      <div
        onMouseDown={dragWindow}
        className={cn(
          "flex h-10 shrink-0 cursor-default items-center",
          collapsed ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title={entityFilter ? "Expand — entity scope active" : "Expand"}
            className="relative inline-flex items-center justify-center rounded-[var(--r-pill)] transition-opacity duration-[var(--t-base)] ease-[var(--ease)] hover:opacity-70"
          >
            <AppMark size={28} />
            {entityFilter ? (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-[var(--r-pill)] bg-[var(--accent)] shadow-[0_0_0_2px_var(--mantle)]"
              />
            ) : null}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <AppMark size={24} />
            <span className="font-ui text-[var(--t-ui)] font-light uppercase tracking-[0.16em] text-[var(--accent)]">
              InteliZen
            </span>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-[var(--r-pill)]",
              "font-ui text-[var(--t-ui)] text-[var(--overlay-1)]",
              "transition-colors duration-[var(--t-base)] ease-[var(--ease)]",
              "hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
            )}
            aria-label="Collapse sidebar"
            title="Collapse"
          >
            ‹
          </button>
        )}
      </div>

      {/* The hierarchy owns the rail; destinations stay together at its foot. */}
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden pb-2 pt-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {collapsed ? (
          <div>
            <NavLink
              to="/home"
              aria-label="Workspace"
              title="Workspace"
              className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-[var(--r-pill)] text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--subtext-1)]"
            >
              <FolderTree aria-hidden strokeWidth={1.5} className="h-[18px] w-[18px]" />
            </NavLink>
            <PluginSidebarEntries collapsed />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WorkspaceTree />
            <PluginSidebarEntries collapsed={false} />
          </div>
        )}
        <div className={cn("shrink-0", collapsed ? "mt-auto grid gap-0.5" : "mt-3 border-t border-[var(--border-subtle)] pt-2")}>
          {!collapsed ? <div className="flex h-[26px] items-center px-2 font-ui text-[var(--t-count)] font-light uppercase tracking-[0.18em] text-[var(--overlay-1)]">Places</div> : null}
        {PLACE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                collapsed ? "rail-node mx-auto" : "nav-node h-[26px]",
              )}
            >
              {collapsed ? (
                <Icon aria-hidden strokeWidth={1.5} className="h-[18px] w-[18px]" />
              ) : (
                <>
                  <span>{item.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-[var(--overlay-0)]">{item.shortcut}</span>
                </>
              )}
            </NavLink>
          );
        })}
        </div>
      </nav>

      {/* Footer */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex h-10 shrink-0 items-center",
          collapsed ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <NavLink
            to="/settings?section=providers"
            aria-label="Open settings"
            title={engineTitle}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-pill)] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <Settings className="h-4 w-4" />
            <span
              aria-hidden
              className={cn(
                "absolute right-1 top-1 h-1.5 w-1.5 rounded-[var(--r-pill)] shadow-[0_0_0_2px_var(--crust)]",
                ENGINE_DOT_CLASS[engineTag],
              )}
            />
          </NavLink>
        ) : (
          <>
            <NavLink
              to="/settings?section=providers"
              aria-label="Open settings"
              title={engineTitle}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--r-ctl)] px-0.5 py-1 text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            >
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-[var(--r-pill)] px-2 py-px font-ui text-[var(--t-section)] leading-4",
                  ENGINE_TAG_CLASS[engineTag],
                )}
              >
                {engineTag}
              </span>
              {(engineTag === "connected" || engineTag === "pin mismatch") && engineInfo ? (
                <span className="truncate font-mono text-[var(--t-count)] text-[var(--overlay-1)]">
                  {engineInfo.version} · :{engineInfo.port}
                </span>
              ) : null}
              <span className="flex-1" />
              <Settings className="h-4 w-4 shrink-0" aria-hidden />
            </NavLink>
          </>
        )}
      </div>
      <PaneResizeEdges west />
    </aside>
  );
}
