import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FileText,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Radar,
  Search,
  Target,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { getUnreadSignalCount } from "@/lib/data";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Inbox", to: "/inbox", icon: Radar },
  { label: "Search", to: "/search", icon: Search },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Monitors", to: "/monitors", icon: Activity },
  { label: "Graph", to: "/graph", icon: GitBranch },
  { label: "Investigate", to: "/investigate", icon: Target },
  { label: "Reports", to: "/reports", icon: FileText },
];

export function Sidebar() {
  const { data: unreadCount } = useQuery({
    queryKey: ["signals", "unread-count"],
    queryFn: getUnreadSignalCount,
    staleTime: 30_000,
  });

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      {/* Header */}
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] flex items-center justify-center shadow-[0_0_20px_rgba(0,212,170,0.3)]">
            <LayoutDashboard className="h-5 w-5 text-[var(--background)]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--accent)]">
              IntelliZen
            </p>
            <h1 className="text-sm font-semibold text-[var(--foreground)]">
              Intelligence Platform
            </h1>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--foreground-muted)] leading-relaxed">
          Personal intelligence workstation for OSINT investigations and analysis.
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-[var(--accent)]/10 to-transparent border-l-2 border-[var(--accent)] text-[var(--foreground)]"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[rgba(255,255,255,0.02)]"
                )
              }
            >
              <span className="flex items-center gap-3">
                <item.icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.label === "Inbox" && unreadCount ? (
                <Badge variant="accent" className="h-5 min-w-5 flex items-center justify-center">
                  {unreadCount}
                </Badge>
              ) : null}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Footer Stats */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="rounded-xl bg-[var(--surface)]/50 border border-[var(--border)] p-4">
          <p className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
            System Status
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--foreground-dim)]">Data Source</span>
              <span className="text-xs text-[var(--success)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success-glow)]" />
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--foreground-dim)]">Vault Access</span>
              <span className="text-xs text-[var(--success)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success-glow)]" />
                Ready
              </span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-[var(--foreground-dim)] text-center">
          V2.0 • macOS Tauri Build
        </p>
      </div>
    </aside>
  );
}
