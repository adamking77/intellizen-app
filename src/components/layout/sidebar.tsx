import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FileText,
  FolderKanban,
  GitBranch,
  Radar,
  Search,
  Target,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { getUnreadSignalCount } from "@/lib/data";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Inbox",      to: "/inbox",       icon: Radar,        key: "inbox"       },
  { label: "Search",     to: "/search",      icon: Search,       key: "search"      },
  { label: "Projects",   to: "/projects",    icon: FolderKanban, key: "projects"    },
  { label: "Monitors",   to: "/monitors",    icon: Activity,     key: "monitors"    },
  { label: "Graph",      to: "/graph",       icon: GitBranch,    key: "graph"       },
  { label: "Investigate",to: "/investigate", icon: Target,       key: "investigate" },
  { label: "Reports",    to: "/reports",     icon: FileText,     key: "reports"     },
];

export function Sidebar() {
  const { data: unreadCount } = useQuery({
    queryKey: ["signals", "unread-count"],
    queryFn: getUnreadSignalCount,
    staleTime: 30_000,
  });

  return (
    <aside className="group/sb relative z-10 flex h-dvh w-14 shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--panel)] transition-[width] duration-300 ease-in-out hover:w-52">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-[var(--border)] px-[13px]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] shadow-[0_0_16px_rgba(0,212,170,0.25)]">
          <Zap className="h-4 w-4 text-[#080c10]" />
        </div>
        <div className="ml-3 overflow-hidden">
          <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)] opacity-0 transition-opacity duration-200 group-hover/sb:opacity-100">
            InteliZen
          </p>
          <p className="whitespace-nowrap text-[11px] font-medium text-[var(--foreground-dim)] opacity-0 transition-opacity duration-200 group-hover/sb:opacity-100">
            Intel Platform
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-hidden p-2 pt-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 overflow-hidden rounded-lg px-[9px] py-2.5 text-sm transition-all duration-150",
                isActive
                  ? "bg-[var(--accent)]/[0.08] border border-[var(--accent)]/20 text-[var(--accent)]"
                  : "border border-transparent text-[var(--foreground-dim)] hover:border-[var(--border)] hover:bg-white/[0.025] hover:text-[var(--foreground-muted)]"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                )}
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors duration-150",
                    isActive ? "text-[var(--accent)]" : "text-current"
                  )}
                />
                <span className="flex flex-1 items-center justify-between overflow-hidden">
                  <span className="whitespace-nowrap text-[13px] font-medium opacity-0 transition-opacity duration-200 group-hover/sb:opacity-100">
                    {item.label}
                  </span>
                  {item.key === "inbox" && unreadCount ? (
                    <span className="ml-2 shrink-0 whitespace-nowrap rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)] opacity-0 transition-opacity duration-200 group-hover/sb:opacity-100">
                      {unreadCount}
                    </span>
                  ) : null}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-3 px-[3px]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--success)] shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--foreground-dim)] opacity-0 transition-opacity duration-200 group-hover/sb:opacity-100">
            Systems nominal
          </span>
        </div>
      </div>
    </aside>
  );
}
