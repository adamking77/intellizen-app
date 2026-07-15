import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Loader2, Search as SearchIcon, Target, X } from "lucide-react";

import { ProjectPickerModal } from "@/components/projects/project-picker-modal";
import { SignalCard } from "@/components/signals/signal-card";
import { Button } from "@/components/ui/button";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { Select } from "@/components/ui/select";
import { VentureScope } from "@/components/ui/venture-scope";
import { listOperations, listProjects, saveSearchResultToProject, searchWorkspace } from "@/lib/data";
import { runExaSearch } from "@/lib/exa";
import { runCorporateSearch, runSanctionsSearch } from "@/lib/sensors";
import { ventureScopeLabel } from "@/lib/taxonomy";
import { toast, toastError } from "@/lib/toast";
import type { AdmiraltyReliability, DeepResearchResult, InternalSearchResult, SearchMode, SearchResultItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWindowSize } from "@/lib/use-window-size";
import { useAppStore } from "@/store";

type ModeDef = {
  value: SearchMode;
  label: string;
  description: string;
  placeholder: string;
  example: string;
};

const SEARCH_MODES: ModeDef[] = [
  {
    value: "internal",
    label: "Internal",
    description: "Search workspace records, knowledge, and saved signals",
    placeholder: "Search IntelliZen memory…",
    example: "Fiona approval receipts",
  },
  {
    value: "web",
    label: "Web",
    description: "Semantic web search with AI autoprompt",
    placeholder: "Enter a search query…",
    example: "family office exploitation case studies",
  },
  {
    value: "news",
    label: "News",
    description: "Date-filterable current events",
    placeholder: "Search recent news…",
    example: "crypto fraud indictments 2026",
  },
  {
    value: "research_papers",
    label: "Papers",
    description: "Peer-reviewed academic research",
    placeholder: "Search research papers…",
    example: "coercive control detection framework",
  },
  {
    value: "company",
    label: "Company",
    description: "Corporate sites and profiles",
    placeholder: "Find companies…",
    example: "wealth advisory firms Singapore",
  },
  {
    value: "people",
    label: "People",
    description: "Personal sites and biographies",
    placeholder: "Find people…",
    example: "investigative journalists Southeast Asia",
  },
  {
    value: "financial_reports",
    label: "Financial",
    description: "Financial filings and reports",
    placeholder: "Search financial reports…",
    example: "SEC enforcement actions fiduciary breach",
  },
  {
    value: "sanctions",
    label: "Sanctions",
    description: "Screen OpenSanctions for sanctions and PEP matches",
    placeholder: "Screen a person or entity…",
    example: "Glencore",
  },
  {
    value: "corporate",
    label: "Corporate",
    description: "Search corporate registries and securities identifiers",
    placeholder: "Find corporate registry records…",
    example: "OpenAI",
  },
  {
    value: "deep_research",
    label: "Deep",
    description: "Async multi-source research brief (30s+)",
    placeholder: "Describe what you want researched…",
    example: "Map the Singapore family-office regulatory landscape and recent enforcement trends.",
  },
];

type SortKey = "score" | "date";
type SearchListResult = SearchResultItem | InternalSearchResult;
type SearchMutationResult = SearchListResult[] | DeepResearchResult;

function isInternalResult(result: SearchListResult): result is InternalSearchResult {
  return "source_type" in result;
}

function sortResults(results: SearchListResult[], sortKey: SortKey): SearchListResult[] {
  const copy = [...results];
  if (sortKey === "score") {
    copy.sort((a, b) => {
      const left = isInternalResult(a) ? a.rank : (a.exa_score ?? 0);
      const right = isInternalResult(b) ? b.rank : (b.exa_score ?? 0);
      return right - left;
    });
  } else {
    copy.sort((a, b) => {
      const ad = isInternalResult(a)
        ? new Date(a.updated_at).getTime()
        : a.published_at ? new Date(a.published_at).getTime() : 0;
      const bd = isInternalResult(b)
        ? new Date(b.updated_at).getTime()
        : b.published_at ? new Date(b.published_at).getTime() : 0;
      return bd - ad;
    });
  }
  return copy;
}

export function SearchView() {
  const queryClient = useQueryClient();
  const { isCramped } = useWindowSize();
  const [mode, setMode] = useState<SearchMode>("web");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [pendingResult, setPendingResult] = useState<
    SearchResultItem | DeepResearchResult | null
  >(null);
  const [sourceReliability, setSourceReliability] = useState<AdmiraltyReliability>("B");
  const [infoCredibility, setInfoCredibility] = useState(2);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchTargetProjectId = useAppStore((state) => state.searchTargetProjectId);
  const setSearchTargetProjectId = useAppStore((state) => state.setSearchTargetProjectId);
  const entityFilter = useAppStore((state) => state.entityFilter);

  const { data: projects } = useQuery({
    queryKey: ["projects", entityFilter],
    queryFn: () => listProjects({ entity: entityFilter }),
  });

  const { data: operations } = useQuery({
    queryKey: ["operations", entityFilter],
    queryFn: () => listOperations({ entity: entityFilter }),
  });

  const targetProject = useMemo(
    () => projects?.find((project) => project.id === searchTargetProjectId) ?? null,
    [projects, searchTargetProjectId],
  );
  const targetWorkItem = useMemo(
    () => operations?.find((operation) => operation.id === targetProject?.operation_id) ?? null,
    [operations, targetProject?.operation_id],
  );

  const searchMutation = useMutation({
    mutationFn: (): Promise<SearchMutationResult> => {
      if (mode === "internal") {
        return searchWorkspace({ query, entity: entityFilter, limit: 30 });
      }
      if (mode === "sanctions") {
        return runSanctionsSearch(query);
      }
      if (mode === "corporate") {
        return runCorporateSearch(query);
      }
      return runExaSearch({ mode, query, startDate });
    },
    onError: (err) => toastError("Search failed", err),
  });

  const results = searchMutation.data;
  const isDeep = mode === "deep_research";
  const canRunSearch = query.trim().length > 0 && !searchMutation.isPending;
  const hasResults =
    results !== undefined || searchMutation.isPending || !!searchMutation.error;

  const activeMode = SEARCH_MODES.find((m) => m.value === mode)!;

  const sortedListResults = useMemo(
    () => (Array.isArray(results) ? sortResults(results, sortKey) : null),
    [results, sortKey],
  );

  function runSearch() {
    if (!canRunSearch) return;
    searchMutation.mutate();
  }

  function openCollectionPicker(result: SearchResultItem | DeepResearchResult) {
    setPendingResult(result);
    setSourceReliability(result.source_reliability ?? "B");
    setInfoCredibility(result.info_credibility ?? 2);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--base)]">
      {/* Minimal breadcrumb header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--base)] px-4">
        <span className="text-label">Search</span>
        {hasResults ? (
          <>
            <span className="text-[var(--overlay-1)]">›</span>
            <span className="font-ui text-[12px] text-[var(--subtext-0)]">
              {activeMode.label}
            </span>
            <button
              type="button"
              onClick={() => {
                searchMutation.reset();
                setQuery("");
                setTimeout(() => {
                  if (isDeep) textareaRef.current?.focus();
                  else inputRef.current?.focus();
                }, 0);
              }}
              className="ml-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-ui text-[11px] font-medium text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              title="New search"
            >
              <X className="h-3 w-3" />
              New search
            </button>
          </>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <VentureScope className={isCramped ? "hidden sm:inline-flex" : undefined} />
          {targetProject && !isCramped ? (
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1">
              <Target className="h-3 w-3 shrink-0 text-[var(--accent)]" />
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">Save to</span>
              <span className="truncate font-ui text-[12px] text-[var(--text)]">
                {targetWorkItem ? `${targetWorkItem.name} › ` : ""}{targetProject.name}
              </span>
              <button
                type="button"
                onClick={() => setSearchTargetProjectId(null)}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Clear target"
                aria-label="Clear search target"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Hero composer OR docked composer + results */}
      {hasResults ? (
        <>
          {/* Docked composer */}
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--base)] px-4 py-3">
            <div className="mx-auto max-w-[880px]">
              <ModeTabs mode={mode} onChange={setMode} compact />
              <div className="mt-2">
                <SearchComposer
                  mode={mode}
                  query={query}
                  onQuery={setQuery}
                  startDate={startDate}
                  onStartDate={setStartDate}
                  onRun={runSearch}
                  canRun={canRunSearch}
                  isPending={searchMutation.isPending}
                  isCramped={isCramped}
                  inputRef={inputRef}
                  textareaRef={textareaRef}
                  onKeyDown={onKeyDown}
                  compact
                />
              </div>
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[880px] flex-col gap-3 px-6 py-6">
              {searchMutation.error ? (
                <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 font-ui text-[13px] text-[var(--danger)]">
                  {searchMutation.error.message}
                </div>
              ) : null}

              {searchMutation.isPending ? (
                isDeep ? (
                  <DeepProgressStrip />
                ) : (
                  <ResultsSkeleton />
                )
              ) : null}

              {sortedListResults ? (
                sortedListResults.length === 0 ? (
                  <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 font-ui text-[13px] text-[var(--subtext-0)]">
                    No results.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-label">
                        Results · {sortedListResults.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-label">Sort</span>
                        <Select
                          value={sortKey}
                          onChange={(e) => setSortKey(e.target.value as SortKey)}
                          controlSize="xs"
                          aria-label="Sort results"
                        >
                          <option value="score">Score</option>
                          <option value="date">Date</option>
                        </Select>
                      </div>
                    </div>
                    {sortedListResults.map((result) => (
                      isInternalResult(result) ? (
                        <InternalResultCard key={`${result.source_type}:${result.source_id}`} result={result} />
                      ) : (
                        <SignalCard
                          key={result.url}
                          title={result.title}
                          url={result.url}
                          source={result.source}
                          publishedAt={result.published_at}
                          snippet={result.snippet}
                          score={result.exa_score}
                          onSave={() => openCollectionPicker(result)}
                        />
                      )
                    ))}
                  </>
                )
              ) : results && !Array.isArray(results) ? (
                <div className="flex flex-col gap-5 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-6">
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-label">Deep Research</span>
                      <h2 className="text-heading tracking-tight">{results.title}</h2>
                      <span className="font-mono text-[11px] text-[var(--overlay-1)]">
                        {results.source}
                      </span>
                    </div>
                    <Button size="sm" onClick={() => openCollectionPicker(results)}>
                      Save
                    </Button>
                  </div>
                  <MarkdownBody content={results.content} />
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        /* ---------- HERO composer (empty state) ---------- */
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-[720px] flex-col px-6 pt-[14vh] pb-12">
            <div className="mb-6">
              <h1 className="text-display-md">What are you looking for?</h1>
              <p className="mt-2 font-ui text-[14px] text-[var(--subtext-0)]">
                Pick a mode, enter a query, and InteliZen will search internal state or fetch from Exa.
              </p>
            </div>

            <ModeTabs mode={mode} onChange={setMode} />

            <div className="mt-4">
              <SearchComposer
                mode={mode}
                query={query}
                onQuery={setQuery}
                startDate={startDate}
                onStartDate={setStartDate}
                onRun={runSearch}
                canRun={canRunSearch}
                isPending={searchMutation.isPending}
                isCramped={isCramped}
                inputRef={inputRef}
                textareaRef={textareaRef}
                onKeyDown={onKeyDown}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                  {activeMode.description}
                </p>
                <span className="hidden font-mono text-[11px] text-[var(--overlay-1)] sm:inline">
                  ⌘↵ to run
                </span>
              </div>
            </div>

            {/* Example query affordance */}
            <button
              type="button"
              onClick={() => {
                setQuery(activeMode.example);
                setTimeout(() => {
                  if (isDeep) textareaRef.current?.focus();
                  else inputRef.current?.focus();
                }, 0);
              }}
              className="mt-6 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--mantle)] px-4 py-2 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-wash-strong)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
              <span className="shrink-0 text-label">Try</span>
              <span className="min-w-0 font-ui text-[13px] text-[var(--subtext-1)]">
                  {activeMode.example}
              </span>
            </button>
          </div>
        </div>
      )}

      <ProjectPickerModal
        open={pendingResult !== null}
        onClose={() => setPendingResult(null)}
        onSelect={async (projectId) => {
          if (!pendingResult) return;
          try {
            await saveSearchResultToProject({
              projectId,
              result: {
                ...pendingResult,
                source_reliability: sourceReliability,
                info_credibility: infoCredibility,
              },
            });
            await queryClient.invalidateQueries({ queryKey: ["projects"] });
            await queryClient.invalidateQueries({ queryKey: ["signals"] });
            setSearchTargetProjectId(projectId);
            toast.success("Saved to work item", { description: `Evidence pile: ${(projects ?? []).find((project) => project.id === projectId)?.name ?? "Selected pile"}` });
          } catch (err) {
            toastError("Couldn't save result", err);
          } finally {
            setPendingResult(null);
          }
        }}
        title={pendingResult ? `Save "${pendingResult.title}" to a work item` : "Save to work item"}
        detailsSlot={
          pendingResult ? (
            <AdmiraltyControls
              sourceReliability={sourceReliability}
              onSourceReliability={setSourceReliability}
              infoCredibility={infoCredibility}
              onInfoCredibility={setInfoCredibility}
            />
          ) : null
        }
      />
    </div>
  );
}

function AdmiraltyControls({
  sourceReliability,
  onSourceReliability,
  infoCredibility,
  onInfoCredibility,
}: {
  sourceReliability: AdmiraltyReliability;
  onSourceReliability: (value: AdmiraltyReliability) => void;
  infoCredibility: number;
  onInfoCredibility: (value: number) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5">
        <span className="text-label">Source reliability</span>
        <Select
          value={sourceReliability}
          onChange={(event) => onSourceReliability(event.target.value as AdmiraltyReliability)}
          containerClassName="w-full"
        >
          <option value="A">A - reliable</option>
          <option value="B">B - usually reliable</option>
          <option value="C">C - fairly reliable</option>
          <option value="D">D - not usually reliable</option>
          <option value="E">E - unreliable</option>
          <option value="F">F - cannot judge</option>
        </Select>
      </label>
      <label className="grid gap-1.5">
        <span className="text-label">Information credibility</span>
        <Select
          value={infoCredibility}
          onChange={(event) => onInfoCredibility(Number(event.target.value))}
          containerClassName="w-full"
        >
          <option value={1}>1 - confirmed</option>
          <option value={2}>2 - probably true</option>
          <option value={3}>3 - possibly true</option>
          <option value={4}>4 - doubtful</option>
          <option value={5}>5 - improbable</option>
          <option value={6}>6 - cannot judge</option>
        </Select>
      </label>
    </div>
  );
}

// ============================================================
// Mode tabs
// ============================================================

function ModeTabs({
  mode,
  onChange,
  compact = false,
}: {
  mode: SearchMode;
  onChange: (m: SearchMode) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "scrollbar-quiet flex items-center gap-1 overflow-x-auto",
        compact ? "h-8" : "h-9",
      )}
    >
      {SEARCH_MODES.map((item) => {
        const isActive = mode === item.value;
        const isDeep = item.value === "deep_research";
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
              "font-ui text-[12px] font-medium",
              "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
              isActive
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
            )}
            title={item.description}
          >
            {item.label}
            {isDeep && !compact ? (
              <span className="rounded-sm bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--warning)]">
                Async
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Composer
// ============================================================

function SearchComposer({
  mode,
  query,
  onQuery,
  startDate,
  onStartDate,
  onRun,
  canRun,
  isPending,
  isCramped,
  inputRef,
  textareaRef,
  onKeyDown,
  compact = false,
}: {
  mode: SearchMode;
  query: string;
  onQuery: (v: string) => void;
  startDate: string;
  onStartDate: (v: string) => void;
  onRun: () => void;
  canRun: boolean;
  isPending: boolean;
  isCramped: boolean;
  inputRef: React.Ref<HTMLInputElement>;
  textareaRef: React.Ref<HTMLTextAreaElement>;
  onKeyDown: (e: React.KeyboardEvent) => void;
  compact?: boolean;
}) {
  const activeMode = SEARCH_MODES.find((m) => m.value === mode)!;
  const isDeep = mode === "deep_research";
  const runContent = isPending ? (
    <>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {isDeep ? "Researching…" : "Searching…"}
    </>
  ) : isDeep ? (
    "Start research →"
  ) : (
    "Run"
  );

  return (
    <form
      className={cn("min-w-0 gap-2", isDeep ? "flex flex-col items-stretch" : "flex items-center")}
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      {isDeep ? (
        <>
          <textarea
            ref={textareaRef}
            placeholder={activeMode.placeholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={onKeyDown}
            rows={compact ? 2 : 3}
            className={cn(
              "w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--mantle)] px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--overlay-1)]",
              "focus:border-[var(--accent)] focus:outline-none",
              compact ? "font-ui text-[13px]" : "font-ui text-[15px] leading-[1.5]",
            )}
            autoFocus={!compact}
          />
          <Button
            type="submit"
            disabled={!canRun}
            className={cn("min-w-[148px] self-end gap-1.5 px-5", compact ? "h-9" : "h-10")}
          >
            {runContent}
          </Button>
        </>
      ) : (
        <>
          <div className="relative flex min-w-0 flex-1 items-center">
            <SearchIcon className="pointer-events-none absolute left-4 h-4 w-4 text-[var(--overlay-1)]" />
          <input
            ref={inputRef}
            type="text"
            placeholder={activeMode.placeholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "w-full rounded-full border border-[var(--border)] bg-[var(--mantle)] pl-10 pr-[116px] text-[var(--text)] placeholder:text-[var(--overlay-1)]",
              "transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent)] focus:outline-none focus:shadow-[0_0_0_1px_var(--accent-border)]",
              compact ? "h-9 font-ui text-[13px]" : "h-12 font-ui text-[15px]",
            )}
            autoFocus={!compact}
          />
            <Button
              type="submit"
              disabled={!canRun}
              className={cn(
                "absolute right-1 min-w-[96px] shrink-0 gap-1.5 px-4",
                compact ? "h-7" : "h-10",
              )}
            >
              {runContent}
            </Button>
          </div>

          {mode === "news" && !isCramped ? (
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDate(e.target.value)}
              className={cn(
                "rounded-lg border border-[var(--border)] bg-[var(--mantle)] px-2 font-mono text-[11px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none",
                compact ? "h-9" : "h-12",
              )}
              title="Earliest publish date"
            />
          ) : null}
        </>
      )}
    </form>
  );
}

function InternalResultCard({ result }: { result: InternalSearchResult }) {
  const updated = result.updated_at ? new Date(result.updated_at).toLocaleDateString() : null;
  const sourceLabel = result.source_type.replace(/_/g, " ");

  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--mantle)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-sm bg-[var(--surface-wash)] px-1.5 py-0.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              {sourceLabel}
            </span>
            <span className="font-mono text-[10px] text-[var(--overlay-1)]">
              {ventureScopeLabel(result.entity)}
            </span>
          </div>
          {result.url ? (
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="font-ui text-[15px] font-semibold text-[var(--text)] hover:text-[var(--accent)]"
            >
              {result.title}
            </a>
          ) : (
            <h3 className="font-ui text-[15px] font-semibold text-[var(--text)]">{result.title}</h3>
          )}
          {result.subtitle ? (
            <p className="mt-1 font-ui text-[12px] text-[var(--subtext-0)]">{result.subtitle}</p>
          ) : null}
        </div>
        {updated ? (
          <span className="shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">{updated}</span>
        ) : null}
      </div>
      {result.excerpt ? (
        <p className="mt-3 line-clamp-3 font-ui text-[13px] leading-6 text-[var(--subtext-1)]">
          {result.excerpt}
        </p>
      ) : null}
    </div>
  );
}

// ============================================================
// Loading states
// ============================================================

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-md border border-[var(--border-subtle)] bg-[var(--mantle)] p-4"
        >
          <div className="h-4 w-3/4 rounded bg-[var(--surface-wash-strong)]" />
          <div className="mt-3 h-3 w-full rounded bg-[var(--surface-wash)]" />
          <div className="mt-2 h-3 w-5/6 rounded bg-[var(--surface-wash)]" />
          <div className="mt-3 flex gap-3">
            <div className="h-2.5 w-16 rounded bg-[var(--surface-wash)]" />
            <div className="h-2.5 w-20 rounded bg-[var(--surface-wash)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DeepProgressStrip() {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-5">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
        <span className="font-ui text-[13px] font-medium text-[var(--text)]">
          Running Deep Research
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--overlay-1)]">
          ~30–60s
        </span>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded bg-[var(--surface-wash)]">
        <div
          className="h-full w-1/3 rounded bg-[var(--accent)]"
          style={{ animation: "deep-progress 2.4s ease-in-out infinite" }}
        />
      </div>
      <p className="mt-3 font-ui text-[12px] text-[var(--overlay-1)]">
        Exa is searching across multiple sources and synthesizing a structured brief.
        This usually takes 30–60 seconds.
      </p>
      <style>{`
        @keyframes deep-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
