import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import appPackage from "../../../package.json";
import {
  Database,
  FileText,
  FolderTree,
  House,
  LayoutGrid,
  Network,
  Search,
  Settings,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { PaneResizeEdges, useWindowDrag } from "@/components/layout/window-chrome";
import { WorkspaceTree } from "@/components/layout/workspace-tree";
import { describeEngine, deriveEngineTag, useEngineStore, type EngineTag } from "@/engine/engine-store";
import { listWorkspaceDatabases } from "@/lib/data";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { PluginSidebarEntries } from "@/plugins/sidebar-entries";

type NavItem = { label: string; to: string; key: string; icon: LucideIcon };

// Observational and orchestration surfaces belong on Home as widgets. Inbox
// and Monitors are retired in favor of Fiona's daily brief; Agent Work,
// Agent Work and Roles are represented by database-backed Home views.
const NAV_ITEMS: NavItem[] = [
  { label: "Home", to: "/home", key: "home", icon: House },
  { label: "Search", to: "/search", key: "search", icon: Search },
  { label: "Workflows", to: "/workflows", key: "workflows", icon: Workflow },
  { label: "Agents", to: "/agents", key: "agents", icon: UsersRound }, // wave-1 agents-page: Agents replaces Team
  { label: "Databases", to: "/databases", key: "databases", icon: Database },
  { label: "Docs", to: "/docs", key: "docs", icon: FileText },
  { label: "Graph", to: "/graph", key: "graph", icon: Network },
  { label: "Canvas", to: "/canvas", key: "canvas", icon: LayoutGrid },
  { label: "Settings", to: "/settings", key: "settings", icon: Settings },
];

const APP_VERSION = `v${appPackage.version}`;
// Donor: hermes-app tokens.css `.tag` / `.tag.ok` — 11px, 1px 8px, pill.
const ENGINE_TAG_CLASS: Record<EngineTag, string> = {
  connected: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]",
  "starting…": "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext-0)]",
  offline: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-[var(--danger)]",
};
const ENGINE_DOT_CLASS: Record<EngineTag, string> = {
  connected: "bg-[var(--success)]",
  "starting…": "bg-[var(--subtext-0)]",
  offline: "bg-[var(--danger)]",
};
const STORAGE_KEY = "intelizen:sidebar-collapsed";
const WIDTH_EXPANDED = 216;
const WIDTH_COLLAPSED = 56;

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
  const dragWindow = useWindowDrag();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const { data: databases = [] } = useQuery({
    queryKey: ["workspace-databases", entityFilter],
    queryFn: () => listWorkspaceDatabases({ entity: entityFilter }),
    staleTime: 30_000,
  });
  const { isCramped } = useWindowSize();

  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() => readCollapsed());
  const engineConnection = useEngineStore((state) => state.connection);
  const engineInfo = useEngineStore((state) => state.info);
  const engineError = useEngineStore((state) => state.error);
  const engineTag = deriveEngineTag({ connection: engineConnection, error: engineError });
  const engineTitle = `${describeEngine({ connection: engineConnection, info: engineInfo, error: engineError })} · IntelliZen ${APP_VERSION}`;
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

  const toggle = () => setUserCollapsed(!collapsed);
  return (
    <aside
      style={{
        width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED,
        background: "var(--mantle)",
      }}
      className={cn(
        "relative z-10 flex shrink-0 flex-col overflow-hidden border border-[var(--border)]",
        "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed
          ? "h-auto max-h-full self-start rounded-[28px] pb-2"
          : "h-full rounded-2xl",
      )}
    >
      {/* Header */}
      <div
        onMouseDown={dragWindow}
        className={cn(
          "flex h-14 shrink-0 cursor-default items-center",
          collapsed ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title={entityFilter ? "Expand — entity scope active" : "Expand"}
            className="relative inline-flex items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-70"
          >
            <svg aria-label="InteliZen" role="img" viewBox="0 0 28 28" className="h-7 w-7 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <circle cx="14" cy="14" r="11.5" />
              <path d="M14 12.5v7" />
              <circle cx="14" cy="8.75" r="1" fill="currentColor" stroke="none" />
            </svg>
            {entityFilter ? (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--mantle)]"
              />
            ) : null}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <img src="/app-icon.svg" alt="" aria-hidden className="h-6 w-6 rounded-md" />
            <span className="font-ui text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              InteliZen
            </span>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full",
              "font-ui text-[13px] text-[var(--overlay-1)]",
              "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
            )}
            aria-label="Collapse sidebar"
            title="Collapse"
          >
            ‹
          </button>
        )}
      </div>

      {/* Nav */}
      <nav
        className={cn(
          "flex flex-1 flex-col gap-0.5 overflow-y-auto pb-4 pt-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {collapsed ? (
          <NavLink
            to="/home"
            aria-label="Workspace"
            title="Workspace"
            className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--subtext-1)]"
          >
            <FolderTree aria-hidden strokeWidth={1.5} className="h-[18px] w-[18px]" />
          </NavLink>
        ) : (
          <div className="mb-3">
            <WorkspaceTree />
          </div>
        )}
        {NAV_ITEMS.map((item) => {
          const showCount = item.key === "databases" ? databases.length : 0;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                collapsed ? "rail-node mx-auto" : "nav-node",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
              )}
            >
              {collapsed ? (
                <Icon aria-hidden strokeWidth={1.5} className="h-[18px] w-[18px]" />
              ) : (
                <>
                  <span>{item.label}</span>
                  {showCount ? (
                    <span className="ml-auto font-mono text-[10px] text-[var(--accent)]">
                      {showCount}
                    </span>
                  ) : null}
                </>
              )}
              {collapsed && showCount ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                />
              ) : null}
            </NavLink>
          );
        })}
        {/* wave-1 plugins: rows contributed by ~/.hermes/plugins */}
        <PluginSidebarEntries collapsed={collapsed} />
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "flex h-10 shrink-0 items-center",
          collapsed ? "justify-center border-t-0 px-0" : "justify-between border-t border-[var(--border)] px-4",
        )}
      >
        {collapsed ? (
          <NavLink
            to="/settings?section=providers"
            aria-label="Open settings"
            title={engineTitle}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <Settings className="h-4 w-4" />
            <span
              aria-hidden
              className={cn(
                "absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-2 ring-[var(--mantle)]",
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
              className="flex min-w-0 items-center gap-2 text-[var(--overlay-1)] hover:text-[var(--text)]"
            >
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-2 py-px font-ui text-[11px] leading-4",
                  ENGINE_TAG_CLASS[engineTag],
                )}
              >
                {engineTag}
              </span>
              {engineTag === "connected" && engineInfo ? (
                <span className="truncate font-mono text-[10px] text-[var(--overlay-1)]">
                  {engineInfo.version} · :{engineInfo.port}
                </span>
              ) : null}
            </NavLink>
          </>
        )}
      </div>
      <PaneResizeEdges west />
    </aside>
  );
}
