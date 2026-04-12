import { Outlet, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Sidebar } from "@/components/layout/sidebar";

const TITLES: Record<string, { title: string; description: string }> = {
  "/inbox": {
    title: "Inbox",
    description: "Pull fresh signals from active monitors, triage what matters, and route it into projects.",
  },
  "/search": {
    title: "Search",
    description: "Run targeted Exa queries across seven modes and save relevant findings directly into a project.",
  },
  "/projects": {
    title: "Projects",
    description: "Organize saved intelligence by use case and manage the working context for each case or report.",
  },
  "/monitors": {
    title: "Monitors",
    description: "Own the saved search templates that drive Inbox refreshes and tune them over time.",
  },
  "/graph": {
    title: "Graph",
    description: "Map person, organisation, location, and event relationships within a single project.",
  },
};

export function AppShell() {
  const location = useLocation();
  const meta = TITLES[location.pathname] ?? TITLES["/inbox"];

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-8 py-8">
          <header className="flex flex-col gap-4 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(24,40,43,0.96),rgba(13,23,25,0.94))] p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">V1</Badge>
              <Badge variant="neutral">macOS-only</Badge>
              <Badge variant="neutral">Pull-based</Badge>
              <Badge variant="neutral">Exa + Supabase</Badge>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="font-serif text-4xl tracking-tight">{meta.title}</h2>
              <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
                {meta.description}
              </p>
            </div>
          </header>

          <Outlet />
        </div>
      </main>
    </div>
  );
}
