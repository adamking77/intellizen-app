import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import {
  Database,
  FileText,
  House,
  LayoutGrid,
  Network,
  Radar,
  Search,
  type LucideIcon,
} from "lucide-react";

import { PaneResizeEdges, useWindowDrag } from "@/components/layout/window-chrome";
import { Select } from "@/components/ui/select";
import { listWorkspaceDatabases, listWorkspaceEntities } from "@/lib/data";
import { TAXONOMY_ENTITY_OPTIONS } from "@/lib/taxonomy";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

type NavItem = { label: string; to: string; key: string; icon: LucideIcon };

// Inbox and Monitors are demoted from primary navigation (2026-07-02):
// collection runs agentically via Fiona/monitor workflows. The /inbox and
// /monitors routes remain deep-linkable for diagnostics.
const NAV_ITEMS: NavItem[] = [
  { label: "Home", to: "/home", key: "home", icon: House },
  { label: "Search", to: "/search", key: "search", icon: Search },
  { label: "Intel", to: "/intel", key: "intel", icon: Radar },
  { label: "Databases", to: "/databases", key: "databases", icon: Database },
  { label: "Docs", to: "/docs", key: "docs", icon: FileText },
  { label: "Graph", to: "/graph", key: "graph", icon: Network },
  { label: "Canvas", to: "/canvas", key: "canvas", icon: LayoutGrid },
];

const APP_VERSION = "v0.4.0";
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
  const setEntityFilter = useAppStore((state) => state.setEntityFilter);
  const { data: databases = [] } = useQuery({
    queryKey: ["workspace-databases", entityFilter],
    queryFn: () => listWorkspaceDatabases({ entity: entityFilter }),
    staleTime: 30_000,
  });
  const { data: workspaceEntities } = useQuery({
    queryKey: ["workspace-entities"],
    queryFn: listWorkspaceEntities,
    staleTime: 10 * 60_000,
  });
  const { isCramped } = useWindowSize();

  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() => readCollapsed());
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
  const entityOptions = (workspaceEntities?.filter((entity) => entity.status !== "archived") ?? [])
    .map((entity) => ({ value: entity.slug, label: entity.label }));
  const visibleEntityOptions = entityOptions.length > 0 ? entityOptions : TAXONOMY_ENTITY_OPTIONS;

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
            className="relative inline-flex items-center justify-center rounded-md transition-opacity duration-150 hover:opacity-70"
          >
            <img src="/app-icon.svg" alt="InteliZen" className="h-7 w-7 rounded-md" />
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
              "inline-flex h-6 w-6 items-center justify-center rounded",
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

      {!collapsed ? (
        <div className="border-y border-[var(--border)] px-3 py-3">
          <Select
            value={entityFilter ?? ""}
            onChange={(event) => setEntityFilter(event.target.value || null)}
            controlSize="sm"
            containerClassName="w-full"
            className="bg-[var(--base)]"
            aria-label="Entity scope"
          >
            <option value="">All entities</option>
            {visibleEntityOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
      ) : null}

      {/* Nav */}
      <nav
        className={cn(
          "flex flex-1 flex-col gap-0.5 overflow-y-auto pb-4 pt-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {NAV_ITEMS.map((item) => {
          const showCount = item.key === "databases" ? databases.length : 0;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center rounded",
                  "font-ui font-medium",
                  "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
                  collapsed
                    ? "mx-auto h-9 w-9 justify-center rounded-full px-0"
                    : "justify-between px-4 py-2 text-[13px]",
                  isActive
                    ? cn("text-[var(--text)]", collapsed && "bg-[var(--surface-wash)]")
                    : "text-[var(--subtext-0)] hover:text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[2px] bg-[var(--accent)]"
                    />
                  )}
                  {collapsed ? (
                    <Icon
                      aria-hidden
                      strokeWidth={1.5}
                      className={cn(
                        "h-[18px] w-[18px]",
                        isActive && "text-[var(--accent)]",
                      )}
                    />
                  ) : (
                    <>
                      <span>{item.label}</span>
                      {showCount ? (
                        <span className="font-mono text-[10px] text-[var(--accent)]">
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
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "flex h-10 shrink-0 items-center",
          collapsed ? "justify-center border-t-0 px-0" : "justify-between border-t border-[var(--border)] px-4",
        )}
      >
        {collapsed ? (
          <span
            aria-hidden
            title="Systems nominal"
            className="h-1.5 w-1.5 rounded-full bg-[var(--success)]"
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-[var(--success)]"
              />
              <span className="font-ui text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--overlay-1)]">
                Systems nominal
              </span>
            </div>
            <span className="font-mono text-[10px] text-[var(--overlay-1)]">
              {APP_VERSION}
            </span>
          </>
        )}
      </div>
      <PaneResizeEdges west />
    </aside>
  );
}
