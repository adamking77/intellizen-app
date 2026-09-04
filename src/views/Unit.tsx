import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { WorkspaceDashboard } from "@/components/home/workspace-dashboard";
import { Card } from "@/components/ui/card";
import { FailureState } from "@/components/ui/empty-state";
import { Identity } from "@/components/ui/identity";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ui/status-pill";
import { getDocumentsWorkspaceBundle, listWorkspaceDatabaseCatalog } from "@/lib/data";
import { breadcrumb, childrenOf, countFor, documentCounts, locateUnit, unitProjectSummary, type UnitChild } from "@/lib/project-center";
import { boardsForProject, loadRoomView, saveRoomView } from "@/lib/project-room";
import { getKanbanBoard, listKanbanBoards, type KanbanCard } from "@/services/hermes-kanban";
import { useHierarchy } from "@/lib/use-hierarchy";

export const CENTER_DOCS_QUERY_KEY = ["docs-workspace-bundle", "center"] as const;
const DEPARTMENT_VIEWS = ["table", "board", "brief"] as const;
const WORKSPACE_VIEWS = ["projects", "dashboard"] as const;
type UnitViewMode = (typeof DEPARTMENT_VIEWS)[number] | (typeof WORKSPACE_VIEWS)[number];

/** A department or workspace: projects in table, board or brief rollup. */
export function UnitView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { tree, isLoading, error } = useHierarchy();
  const docs = useQuery({ queryKey: CENTER_DOCS_QUERY_KEY, queryFn: () => getDocumentsWorkspaceBundle() });
  const unit = locateUnit(tree, id);
  const isWorkspace = unit?.ref.kind === "workspace";
  const rows = useMemo(() => childrenOf(tree, id), [tree, id]);
  const counts = useMemo(() => documentCounts(docs.data?.records ?? []), [docs.data?.records]);
  const views = isWorkspace ? WORKSPACE_VIEWS : DEPARTMENT_VIEWS;
  const [view, setView] = useState<UnitViewMode>(() => loadRoomView(id, isWorkspace ? WORKSPACE_VIEWS : DEPARTMENT_VIEWS));
  const notFound = !isLoading && !error && !unit ? "No department or workspace with this id is in the tree." : undefined;
  const childKind = unit?.ref.kind === "department" ? "workspace" : "project";
  const catalog = useQuery({ queryKey: ["workspace-database-catalog", "unit"], queryFn: () => listWorkspaceDatabaseCatalog(), enabled: isWorkspace, staleTime: 0 });
  const boards = useQuery({ queryKey: ["kanban-boards", "unit"], queryFn: listKanbanBoards, enabled: isWorkspace && rows.some((row) => row.folders.length > 0) });
  const scopedBoards = useMemo(() => {
    const bySlug = new Map(rows.flatMap((row) => boardsForProject(boards.data ?? [], row.folders)).map((board) => [board.slug, board]));
    return [...bySlug.values()];
  }, [boards.data, rows]);
  const boardData = useQuery({
    queryKey: ["kanban-unit", scopedBoards.map((board) => board.slug)],
    queryFn: () => Promise.all(scopedBoards.map(async (board) => ({ board, snapshot: await getKanbanBoard(board.slug) }))),
    enabled: isWorkspace && scopedBoards.length > 0,
  });
  const cardsByProject = useMemo(() => {
    const bySlug = new Map((boardData.data ?? []).map((item) => [item.board.slug, item.snapshot]));
    return new Map(rows.map((row) => [row.id, boardsForProject(scopedBoards, row.folders).flatMap((board) => bySlug.get(board.slug)?.columns.flatMap((column) => column.cards) ?? [])]));
  }, [boardData.data, rows, scopedBoards]);

  useEffect(() => setView(loadRoomView(id, views)), [id, views]);
  const chooseView = (next: UnitViewMode) => {
    setView(next);
    saveRoomView(id, next);
  };
  const open = (row: UnitChild) => navigate(row.kind === "project" ? `/project/${row.id}` : `/unit/${row.id}`);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="shrink-0 px-5 py-3">
        <PageHeader
          title={unit?.name ?? "Unit"}
          breadcrumb={unit?.path.length ? breadcrumb(unit) : undefined}
          state={`${rows.length} ${childKind}${rows.length === 1 ? "" : "s"}`}
          views={unit ? (
            <Segmented
              value={view}
              options={isWorkspace
                ? [{ value: "projects", label: "Projects" }, { value: "dashboard", label: "Dashboard" }]
                : [{ value: "table", label: "Table" }, { value: "board", label: "Board" }, { value: "brief", label: "Brief" }]}
              onValueChange={chooseView}
              label="Unit view"
            />
          ) : undefined}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <QueryState
          isLoading={isLoading || (!isWorkspace && docs.isLoading)}
          error={error ?? notFound ?? (!isWorkspace ? docs.error : null)}
          isEmpty={view !== "dashboard" && rows.length === 0}
          loadingLabel="Loading the tree"
          errorTitle="Unit unavailable"
          emptyTitle={`No ${childKind}s yet`}
          emptyDescription={`New ${childKind}s are added from the tree in the sidebar.`}
          onRetry={() => void (isWorkspace ? Promise.all([catalog.refetch(), boards.refetch()]) : docs.refetch())}
        >
          {view === "dashboard" && unit ? <WorkspaceDashboard workspaceId={unit.ref.id} workspaceName={unit.name} />
              : view === "projects" ? <WorkspaceProjects rows={rows} catalog={catalog.data ?? []} cardsByProject={cardsByProject} loading={catalog.isLoading} sourceNames={[catalog.error ? "Workspace records" : "", boards.error || boardData.error ? "Hermes boards" : ""].filter(Boolean)} onRetry={() => void Promise.all([catalog.refetch(), boards.refetch(), boardData.refetch()])} onOpen={open} />
              : view === "table" ? <UnitTable rows={rows} counts={counts} onOpen={open} />
                : view === "board" ? <UnitBoard rows={rows} counts={counts} onOpen={open} />
                  : <UnitBrief rows={rows} counts={counts} onOpen={open} />}
        </QueryState>
      </div>
    </div>
  );
}

function WorkspaceProjects({ rows, catalog, cardsByProject, loading, sourceNames, onRetry, onOpen }: {
  rows: UnitChild[];
  catalog: Awaited<ReturnType<typeof listWorkspaceDatabaseCatalog>>;
  cardsByProject: Map<string, KanbanCard[]>;
  loading: boolean;
  sourceNames: string[];
  onRetry: () => void;
  onOpen: (row: UnitChild) => void;
}) {
  if (loading) return <Skeleton lines={Math.max(rows.length + 1, 3)} className="px-3 py-4" />;
  return (
    <div className="grid gap-3">
      {sourceNames.length ? <FailureState message={`${sourceNames.join(" and ")} could not be read; available project metadata is still shown.`} action={{ label: "Retry", onClick: onRetry }} /> : null}
      <div className="overflow-x-auto rounded-[var(--r-ctl)] bg-[var(--raised)]">
        <div role="table" aria-label="Projects" className="min-w-[760px]">
          <div role="row" className="grid h-[var(--h-line)] grid-cols-[minmax(180px,1fr)_150px_120px_minmax(170px,1fr)_minmax(170px,1fr)] items-center gap-3 px-3 text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <span role="columnheader">Project</span><span role="columnheader">Holder</span><span role="columnheader">State</span><span role="columnheader">Blocker</span><span role="columnheader">Waiting on you</span>
          </div>
          {rows.map((row) => {
            const summary = unitProjectSummary(row, catalog, cardsByProject.get(row.id));
            return (
              <button key={row.id} type="button" role="row" onClick={() => onOpen(row)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(180px,1fr)_150px_120px_minmax(170px,1fr)_minmax(170px,1fr)] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
                <span role="cell" className="truncate text-[var(--t-ui)] text-[var(--text)]" title={row.name}>{row.name}</span>
                <span role="cell" className="min-w-0">{summary.holder ? <Identity name={summary.holder} /> : <MutedDash />}</span>
                <span role="cell">{summary.state ? <Pill>{summary.state}</Pill> : <MutedDash />}</span>
                <span role="cell" className="truncate text-[var(--t-meta)] text-[var(--text-muted)]" title={summary.blocker ?? undefined}>{summary.blocker ?? "—"}</span>
                <span role="cell" className={summary.waiting ? "truncate text-[var(--t-meta)] text-[var(--wait)]" : "truncate text-[var(--t-meta)] text-[var(--text-muted)]"} title={summary.waiting ?? undefined}>{summary.waiting ?? "—"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MutedDash() {
  return <span className="text-[var(--t-meta)] text-[var(--text-muted)]">—</span>;
}

function UnitTable({ rows, counts, onOpen }: { rows: UnitChild[]; counts: Map<string, number>; onOpen: (row: UnitChild) => void }) {
  return (
    <div role="table" aria-label="Projects" className="overflow-hidden rounded-[var(--r-ctl)] bg-[var(--raised)]">
      <div role="row" className="grid h-[var(--h-line)] grid-cols-[minmax(0,1fr)_140px_110px_100px] items-center gap-3 px-3 text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <span role="columnheader">Project</span><span role="columnheader">Runs as</span><span role="columnheader">State</span><span role="columnheader">Evidence</span>
      </div>
      {rows.map((row) => {
        const count = countFor(counts, row);
        return (
          <button key={row.id} type="button" role="row" onClick={() => onOpen(row)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(0,1fr)_140px_110px_100px] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
            <span role="cell" className="truncate text-[var(--t-ui)] text-[var(--text)]">{row.name}</span>
            <span role="cell" className="text-[var(--t-meta)] text-[var(--text-muted)]">—</span>
            <span role="cell"><Pill>{row.caseLinked ? "client case" : row.kind}</Pill></span>
            <span role="cell" className="font-mono text-[11px] text-[var(--text-muted)]">{count} docs</span>
          </button>
        );
      })}
    </div>
  );
}

function UnitBoard({ rows, counts, onOpen }: { rows: UnitChild[]; counts: Map<string, number>; onOpen: (row: UnitChild) => void }) {
  const groups = [{ label: "Client cases", rows: rows.filter((row) => row.caseLinked) }, { label: "Research", rows: rows.filter((row) => !row.caseLinked) }];
  return (
    <div className="flex gap-3 overflow-x-auto">
      {groups.map((group) => (
        <section key={group.label} className="w-64 shrink-0">
          <div className="mb-2 flex h-[var(--h-row)] items-center justify-between"><h2 className="text-[var(--t-section)] uppercase tracking-[0.12em] text-[var(--text-muted)]">{group.label}</h2><Pill>{group.rows.length}</Pill></div>
          <div className="grid gap-2">
            {group.rows.map((row) => <button key={row.id} type="button" onClick={() => onOpen(row)} className="text-left"><Card><div className="text-[var(--t-ui)] text-[var(--text)]">{row.name}</div><div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">{countFor(counts, row)} documents · —</div></Card></button>)}
          </div>
        </section>
      ))}
    </div>
  );
}

function UnitBrief({ rows, counts, onOpen }: { rows: UnitChild[]; counts: Map<string, number>; onOpen: (row: UnitChild) => void }) {
  const total = rows.reduce((sum, row) => sum + countFor(counts, row), 0);
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <p className="text-[var(--t-ui)] text-[var(--text)]">{rows.length} projects · {rows.filter((row) => row.caseLinked).length} client cases · {total} documents</p>
      <div className="grid gap-px overflow-hidden rounded-[var(--r-ctl)] bg-[var(--hair)]">
        {rows.map((row) => <button key={row.id} type="button" onClick={() => onOpen(row)} className="grid min-h-[var(--h-line)] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-[var(--base)] px-3 text-left hover:bg-[var(--hover)]"><span className="truncate text-[var(--t-ui)] text-[var(--text)]">{row.name}</span><Pill>{row.caseLinked ? "client case" : row.kind}</Pill><span className="font-mono text-[11px] text-[var(--text-muted)]">{countFor(counts, row)} docs</span></button>)}
      </div>
    </div>
  );
}
