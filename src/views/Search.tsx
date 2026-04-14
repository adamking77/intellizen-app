import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProjectPickerDrawer } from "@/components/projects/project-picker-drawer";
import { SignalCard } from "@/components/signals/signal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listProjects, saveSearchResultToProject } from "@/lib/data";
import { runExaSearch } from "@/lib/exa";
import type { DeepResearchResult, SearchMode, SearchResultItem } from "@/lib/types";
import { useAppStore } from "@/store";

const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "news", label: "News" },
  { value: "research_papers", label: "Research Papers" },
  { value: "company", label: "Company" },
  { value: "people", label: "People" },
  { value: "financial_reports", label: "Financial Reports" },
  { value: "deep_research", label: "Deep Research" },
];

export function SearchView() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<SearchMode>("web");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [pendingResult, setPendingResult] = useState<SearchResultItem | DeepResearchResult | null>(
    null,
  );

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Exa search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SEARCH_MODES.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={mode === item.value ? "primary" : "secondary"}
                onClick={() => setMode(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_160px]">
            <Input
              placeholder={
                mode === "deep_research"
                  ? "Write a natural-language research brief"
                  : "Enter a search query"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={mode !== "news"}
            />
            <Button
              onClick={() => searchMutation.mutate()}
              disabled={!query.trim() || searchMutation.isPending}
            >
              {searchMutation.isPending ? "Searching..." : "Run search"}
            </Button>
          </div>
          {targetProject ? (
            <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
              <Badge variant="accent">Target project</Badge>
              <span>{targetProject.name}</span>
              <button
                type="button"
                className="text-[var(--accent)]"
                onClick={() => setSearchTargetProjectId(null)}
              >
                Clear
              </button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {searchMutation.error ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--foreground-muted)]">
          {searchMutation.error.message}
        </div>
      ) : null}

      {Array.isArray(results) ? (
        <div className="grid gap-4">
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
        </div>
      ) : results ? (
        <Card>
          <CardHeader>
            <CardTitle>{results.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Badge variant="accent">Deep Research</Badge>
              <Badge variant="neutral">{results.source}</Badge>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--foreground-muted)]">
                {results.content}
              </pre>
            </div>
            <Button onClick={() => setPendingResult(results)}>Add to Project</Button>
          </CardContent>
        </Card>
      ) : null}

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
    </>
  );
}
