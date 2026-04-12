import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FileText,
  FolderKanban,
  GitBranch,
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
    <aside className="flex h-screen w-72 flex-col border-r border-[var(--border)] bg-[var(--panel)]/95 px-4 py-5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
          IntelliZen
        </p>
        <h1 className="mt-2 font-serif text-2xl text-[var(--foreground)]">
          Personal Intelligence Workstation
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Pull-based Exa monitoring, project triage, and manual graphing on the
          shared Brain data layer.
        </p>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-sm text-[var(--muted-foreground)] transition hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                isActive &&
                  "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]",
              )
            }
          >
            <span className="flex items-center gap-3">
              <item.icon className="h-4 w-4" />
              {item.label}
            </span>
            {item.label === "Inbox" && unreadCount ? (
              <Badge variant="accent">{unreadCount}</Badge>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-4 text-sm text-[var(--muted-foreground)]">
        <p className="font-medium text-[var(--foreground)]">V1 Boundary</p>
        <p className="mt-2">
          Exa collection only. No Claude subprocess, no webhook ingestion, no
          report automation.
        </p>
      </div>
    </aside>
  );
}
