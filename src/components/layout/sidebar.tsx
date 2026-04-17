import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import {
  FileText,
  FolderOpen,
  Inbox,
  Network,
  Rss,
  Search,
  Spline,
  type LucideIcon,
} from "lucide-react";

import { getUnreadSignalCount } from "@/lib/data";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "./command-palette";

type NavItem = { label: string; to: string; key: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { label: "Inbox", to: "/inbox", key: "inbox", icon: Inbox },
  { label: "Monitors", to: "/monitors", key: "monitors", icon: Rss },
  { label: "Search", to: "/search", key: "search", icon: Search },
  { label: "Projects", to: "/projects", key: "projects", icon: FolderOpen },
  { label: "Graph", to: "/graph", key: "graph", icon: Network },
  { label: "Investigate", to: "/investigate", key: "investigate", icon: Spline },
  { label: "Reports", to: "/reports", key: "reports", icon: FileText },
];

const APP_VERSION = "v0.4.0";
const STORAGE_KEY = "intelizen:sidebar-collapsed";
const WIDTH_EXPANDED = 216;
const WIDTH_COLLAPSED = 56;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar() {
  const { data: unreadCount } = useQuery({
    queryKey: ["signals", "unread-count"],
    queryFn: getUnreadSignalCount,
    staleTime: 30_000,
  });
  const { open } = useCommandPalette();
  const { isCramped } = useWindowSize();

  const [userCollapsed, setUserCollapsed] = useState<boolean>(() => readCollapsed());
  const collapsed = userCollapsed || isCramped;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, userCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [userCollapsed]);

  const toggle = () => setUserCollapsed((c) => !c);

  return (
    <aside
      style={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}
      className={cn(
        "relative z-10 flex h-dvh shrink-0 flex-col border-r border-[var(--border)] bg-[var(--mantle)]",
        "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-[var(--border)]",
          collapsed ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <img src="/app-icon.svg" alt="InteliZen" className="h-7 w-7 rounded-md" />
        ) : (
          <div className="flex items-center gap-2">
            <img src="/app-icon.svg" alt="" aria-hidden className="h-6 w-6 rounded-md" />
            <span className="font-ui text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              InteliZen
            </span>
          </div>
        )}
        {!isCramped && (
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded",
              "font-ui text-[13px] text-[var(--overlay-1)]",
              "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "›" : "‹"}
          </button>
        )}
      </div>

      {/* ⌘K trigger — separate row so it stays accessible in both states */}
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-[var(--border)]",
          collapsed ? "justify-center px-0 py-2" : "px-3 py-2",
        )}
      >
        <button
          type="button"
          onClick={open}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--base)]",
            "font-mono text-[11px] text-[var(--subtext-0)]",
            "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "hover:text-[var(--text)] hover:border-[var(--border-strong)]",
            collapsed ? "h-7 w-7 justify-center" : "w-full justify-between px-2 py-1",
          )}
          aria-label="Open command palette"
          title="Command palette (⌘K)"
        >
          {collapsed ? (
            <span>⌘K</span>
          ) : (
            <>
              <span className="font-ui text-[11px] text-[var(--overlay-1)]">Search</span>
              <span>⌘K</span>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          "flex flex-1 flex-col gap-0.5 overflow-y-auto pb-4 pt-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {NAV_ITEMS.map((item) => {
          const showCount = item.key === "inbox" && unreadCount;
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
                    ? "h-9 justify-center px-0"
                    : "justify-between px-4 py-2 text-[13px]",
                  isActive
                    ? "text-[var(--text)]"
                    : "text-[var(--subtext-0)] hover:text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-[var(--accent)]"
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
                          {unreadCount}
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
          "flex shrink-0 border-t border-[var(--border)] py-3",
          collapsed ? "justify-center px-0" : "items-center justify-between px-4",
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
    </aside>
  );
}
