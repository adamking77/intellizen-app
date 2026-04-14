import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search as SearchIcon, X } from "lucide-react";

import { ProjectPickerDrawer } from "@/components/projects/project-picker-drawer";
import { SignalCard } from "@/components/signals/signal-card";
import { Button } from "@/components/ui/button";
import { listProjects, saveSearchResultToProject } from "@/lib/data";
import { runExaSearch } from "@/lib/exa";
import type { DeepResearchResult, SearchMode, SearchResultItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWindowSize } from "@/lib/use-window-size";
import { useAppStore } from "@/store";

const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "news", label: "News" },
  { value: "research_papers", label: "Papers" },
  { value: "company", label: "Company" },
  { value: "people", label: "People" },
  { value: "financial_reports", label: "Financial" },
  { value: "deep_research", label: "Deep" },
];

export function SearchView() {
  const queryClient = useQueryClient();
  const { isCramped } = useWindowSize();
  const [mode, setMode] = useState<SearchMode>("web");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [pendingResult, setPendingResult] = useState<
    SearchResultItem | DeepResearchResult | null
  >(null);

  const searchTargetProjectId = useAppStore((state) => state.searchTargetProjectId);
  const setSearchTargetProjectId = useAppStore((state) => state.setSearchTargetProjectId);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const targetProject = useMemo(
    () => projects?.find((project) => project.id === searchTargetProjectId) ?? null,
    [projects, searchTargetProjectId],
  );

  const searchMutation = useMutation({
    mutationFn: () => runExaSearch({ mode, query, startDate }),
  });

  const results = searchMutation.data;
  const canRunSearch = query.trim().length > 0 && !searchMutation.isPending;

  return (
    <div className="flex h-[calc(100dvh)] w-full flex-col overflow-hidden bg-[var(--base)]">
      {/* Slim topbar: breadcrumb + query + mode chips + run */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4">
        <span className="text-label shrink-0">Search</span>
        <span className="text-[var(--overlay-1)]">›</span>
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canRunSearch) return;
            searchMutation.mutate();
          }}
        >
          <div className="relative flex min-w-0 flex-1 items-center">
            <SearchIcon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--overlay-1)]" />
            <input
              type="text"
              placeholder={
                mode === "deep_research"
                  ? "Write a research brief…"
                  : "Enter a search query…"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] pl-8 pr-3 font-ui text-[13px] text-[var(--text)] placeholder:text-[var(--overlay-1)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          {mode === "news" && !isCramped ? (
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-mono text-[11px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          ) : null}
          <Button size="sm" type="submit" disabled={!canRunSearch} className="gap-1.5">
            {searchMutation.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching…
              </>
            ) : (
              "Run"
            )}
          </Button>
        </form>
      </header>

      {/* Mode chip strip */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--base)] px-4">
        {SEARCH_MODES.map((item) => (
          <button
            key={item.value}
            onClick={() => setMode(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center rounded-md px-2.5 py-1",
              "font-ui text-[12px] font-medium",
              "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
              mode === item.value
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--subtext-0)] hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
            )}
          >
            {item.label}
          </button>
        ))}
        {targetProject ? (
          <div className="ml-auto flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 py-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Target
            </span>
            <span className="font-ui text-[12px] text-[var(--text)]">{targetProject.name}</span>
            <button
              type="button"
              onClick={() => setSearchTargetProjectId(null)}
              className="text-[var(--overlay-1)] hover:text-[var(--text)]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Full-bleed results area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[880px] flex-col gap-3 px-6 py-6">
          {searchMutation.error ? (
            <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 font-ui text-[13px] text-[var(--danger)]">
              {searchMutation.error.message}
            </div>
          ) : null}

          {!results && !searchMutation.isPending && !searchMutation.error ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center">
              <SearchIcon className="h-6 w-6 text-[var(--overlay-1)]" />
              <p className="text-label">Nothing searched yet</p>
              <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                Pick a mode above and enter a query to run an Exa search.
              </p>
            </div>
          ) : null}

          {Array.isArray(results) ? (
            results.length === 0 ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 font-ui text-[13px] text-[var(--subtext-0)]">
                No results.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-label">Results</span>
                  <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                    {results.length}
                  </span>
                </div>
                {results.map((result) => (
                  <SignalCard
                    key={result.url}
                    title={result.title}
                    url={result.url}
                    source={result.source}
                    publishedAt={result.published_at}
                    snippet={result.snippet}
                    score={result.exa_score}
                    onSave={() => setPendingResult(result)}
                  />
                ))}
              </>
            )
          ) : results ? (
            <div className="flex flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-label">Deep Research</span>
                  <h2 className="font-ui text-[15px] font-medium text-[var(--text)]">
                    {results.title}
                  </h2>
                  <span className="font-mono text-[11px] text-[var(--overlay-1)]">
                    {results.source}
                  </span>
                </div>
                <Button size="sm" onClick={() => setPendingResult(results)}>
                  Save
                </Button>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[12px] leading-6 text-[var(--subtext-0)]">
                {results.content}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      <ProjectPickerDrawer
        open={pendingResult !== null}
        onClose={() => setPendingResult(null)}
        onSelect={async (projectId) => {
          if (!pendingResult) return;
          await saveSearchResultToProject({ projectId, result: pendingResult });
          await queryClient.invalidateQueries({ queryKey: ["projects"] });
          await queryClient.invalidateQueries({ queryKey: ["signals"] });
          setSearchTargetProjectId(projectId);
        }}
        title={pendingResult ? `Attach "${pendingResult.title}"` : "Attach to project"}
      />
    </div>
  );
}
