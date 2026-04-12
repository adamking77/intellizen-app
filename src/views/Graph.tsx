import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listGraphEdges, listGraphNodes, listProjects } from "@/lib/data";
import type { GraphEntityType } from "@/lib/types";
import { useAppStore } from "@/store";

export function GraphView() {
  const graphProjectId = useAppStore((state) => state.graphProjectId);
  const setGraphProjectId = useAppStore((state) => state.setGraphProjectId);
  const [label, setLabel] = useState("");
  const [entityType, setEntityType] = useState<GraphEntityType>("person");

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  useEffect(() => {
    if (graphProjectId === null && projects && projects.length > 0) {
      setGraphProjectId(projects[0].id);
    }
  }, [graphProjectId, projects, setGraphProjectId]);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === graphProjectId) ?? null,
    [projects, graphProjectId],
  );

  const nodesQuery = useQuery({
    queryKey: ["graph-nodes", graphProjectId],
    queryFn: () => listGraphNodes(graphProjectId as number),
    enabled: graphProjectId !== null,
  });

  const edgesQuery = useQuery({
    queryKey: ["graph-edges", graphProjectId],
    queryFn: () => listGraphEdges(graphProjectId as number),
    enabled: graphProjectId !== null,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Graph controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
            value={graphProjectId ?? ""}
            onChange={(event) => setGraphProjectId(Number(event.target.value))}
          >
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Next node label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <select
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
            value={entityType}
            onChange={(event) =>
              setEntityType(event.target.value as GraphEntityType)
            }
          >
            <option value="person">Person</option>
            <option value="organisation">Organisation</option>
            <option value="location">Location</option>
            <option value="event">Event</option>
          </select>
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm leading-6 text-[var(--muted-foreground)]">
            Graph data tables are wired in code, but the remote Brain schema still
            needs the Step 9 migration applied before node editing can go live.
          </div>
          <Button variant="secondary" disabled>
            Add node after graph migration
          </Button>
        </CardContent>
      </Card>

      <Card className="min-h-[680px]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{selectedProject?.name ?? "No project selected"}</CardTitle>
            {selectedProject ? <Badge variant="accent">{selectedProject.type}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="grid h-full gap-4">
          {nodesQuery.error || edgesQuery.error ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-sm text-[var(--muted-foreground)]">
              {(nodesQuery.error ?? edgesQuery.error)?.message}
            </div>
          ) : (
            <div className="grid h-full place-items-center rounded-[28px] border border-[var(--border)] bg-[radial-gradient(circle_at_top,rgba(42,85,92,0.24),transparent_55%),linear-gradient(180deg,rgba(14,24,27,0.92),rgba(8,15,17,0.98))]">
              <div className="max-w-xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
                  Graph Canvas
                </p>
                <h3 className="mt-4 font-serif text-3xl text-[var(--foreground)]">
                  Project-scoped relationship mapping
                </h3>
                <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                  The route and data hooks are in place. Once the graph tables are
                  applied to Supabase, this panel becomes the React Flow canvas for
                  manual POLE-style relationship mapping.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Badge variant="neutral">
                    Nodes {(nodesQuery.data ?? []).length}
                  </Badge>
                  <Badge variant="neutral">
                    Edges {(edgesQuery.data ?? []).length}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
