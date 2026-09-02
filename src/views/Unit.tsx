import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { FolderKanban } from "lucide-react";

import { QueryState } from "@/components/ui/query-state";
import { StatusPill } from "@/components/ui/status-pill";
import { getDocumentsWorkspaceBundle } from "@/lib/data";
import { breadcrumb, childrenOf, countFor, documentCounts, locateUnit } from "@/lib/project-center";
import { useHierarchy } from "@/lib/use-hierarchy";

export const CENTER_DOCS_QUERY_KEY = ["docs-workspace-bundle", "center"] as const;

/** A department or workspace: its children as rows. */
export function UnitView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { tree, isLoading, error } = useHierarchy();
  const docs = useQuery({ queryKey: CENTER_DOCS_QUERY_KEY, queryFn: () => getDocumentsWorkspaceBundle() });

  const unit = locateUnit(tree, id);
  const rows = useMemo(() => childrenOf(tree, id), [tree, id]);
  const counts = useMemo(() => documentCounts(docs.data?.records ?? []), [docs.data?.records]);
  const notFound = !isLoading && !error && !unit ? "No department or workspace with this id is in the tree." : undefined;
  const childKind = unit?.ref.kind === "department" ? "workspace" : "project";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
        <FolderKanban className="h-4 w-4 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0">
          <h1 className="truncate font-ui text-[17px] font-semibold text-[var(--text)]">{unit?.name ?? "Unit"}</h1>
          {unit && unit.path.length > 0 ? <p className="truncate text-meta">{breadcrumb(unit)}</p> : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <QueryState
          isLoading={isLoading}
          error={error ?? notFound}
          isEmpty={rows.length === 0}
          loadingLabel="Loading the tree"
          errorTitle="Unit unavailable"
          emptyTitle={`No ${childKind}s yet`}
          emptyDescription={`New ${childKind}s are added from the tree in the sidebar: right-click ${unit?.name ?? "this unit"} and choose New ${childKind}.`}
        >
          <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border)]">
            {rows.map((row) => {
              const count = countFor(counts, row);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => navigate(row.kind === "project" ? `/project/${row.id}` : `/unit/${row.id}`)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-wash)]"
                >
                  <span className="min-w-0 flex-1 truncate font-ui text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
                    {row.name}
                  </span>
                  {row.caseLinked ? <StatusPill variant="new">CASE</StatusPill> : null}
                  <span className="shrink-0 text-meta">{row.kind}</span>
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] text-[var(--overlay-1)]">
                    {docs.isLoading ? "…" : `${count} doc${count === 1 ? "" : "s"}`}
                  </span>
                </button>
              );
            })}
          </div>
        </QueryState>
      </div>
    </div>
  );
}
