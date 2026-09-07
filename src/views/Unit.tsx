import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { WorkspaceDashboard } from "@/components/home/workspace-dashboard";
import { Card } from "@/components/ui/card";
import { FailureState } from "@/components/ui/empty-state";
import { Identity } from "@/components/ui/identity";
import { listWorkEvents } from "@/lib/data/work-receipts";
import { projectHomeTasks } from "@/lib/home-availability";
import { GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/workspace-ids";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ui/status-pill";
import { getDocumentsWorkspaceBundle, listWorkspaceDatabaseCatalog, listWorkspaceDatabaseRecordFields } from "@/lib/data";
import { breadcrumb, childrenOf, countFor, documentCounts, locateUnit, unitProjectSummary, unitProjectRecords, type UnitChild } from "@/lib/project-center";
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
          isEmpty={view !== "dashboard" && view !== "projects" && rows.length === 0}
          loadingLabel="Loading the tree"
          errorTitle="Unit unavailable"
          emptyTitle={`No ${childKind}s yet`}
          emptyDescription={`New ${childKind}s are added from the tree in the sidebar.`}
          onRetry={() => void (isWorkspace ? Promise.all([catalog.refetch(), boards.refetch()]) : docs.refetch())}
        >
          {view === "dashboard" && unit ? <WorkspaceDashboard workspaceId={unit.ref.id} workspaceName={unit.name} />
              : view === "projects" ? <WorkspaceProjects workspaceId={id} rows={rows} catalog={catalog.data ?? []} cardsByProject={cardsByProject} loading={catalog.isLoading} sourceNames={[catalog.error ? "Workspace records" : "", boards.error || boardData.error ? "Hermes boards" : ""].filter(Boolean)} onRetry={() => void Promise.all([catalog.refetch(), boards.refetch(), boardData.refetch()])} onOpen={open} />
              : view === "table" ? <UnitTable rows={rows} counts={counts} onOpen={open} />
                : view === "board" ? <UnitBoard rows={rows} counts={counts} onOpen={open} />
                  : <UnitBrief rows={rows} counts={counts} onOpen={open} />}
        </QueryState>
      </div>
    </div>
  );
}

function WorkspaceProjects({ workspaceId, rows, catalog, cardsByProject, loading, sourceNames, onRetry, onOpen }: {
  workspaceId: string;
  rows: UnitChild[];
  catalog: Awaited<ReturnType<typeof listWorkspaceDatabaseCatalog>>;
  cardsByProject: Map<string, KanbanCard[]>;
  loading: boolean;
  sourceNames: string[];
  onRetry: () => void;
  onOpen: (row: UnitChild) => void;
}) {
  const tasks = useQuery({ queryKey: ["home-tasks"], queryFn: () => listWorkspaceDatabaseRecordFields(GENZEN_WORKSPACE_DATABASE_IDS.tasks), staleTime: 10_000 });
  const scopeIds = new Set([workspaceId, ...rows.flatMap((row) => row.projectIds)]);
  const keepingOut = projectHomeTasks(tasks.data?.records ?? [], null, null)
    .filter((task) => task.keepingOut && !task.completed && task.scopeNodeId && scopeIds.has(task.scopeNodeId));
  if (loading) return <Skeleton lines={Math.max(rows.length + 1, 3)} className="px-3 py-4" />;
  return (
    <div className="mx-auto grid max-w-[960px] gap-5">
      <p className="text-[24px] font-normal leading-snug text-[var(--text)]">{rows.length} {rows.length === 1 ? "project" : "projects"} in this workspace.</p>
      {sourceNames.length ? <FailureState message={`${sourceNames.join(" and ")} could not be read; available project metadata is still shown.`} action={{ label: "Retry", onClick: onRetry }} /> : null}
      <div className="divide-y divide-[var(--hair)] border-y border-[var(--hair)]">
        {rows.map((row) => <WorkspaceProjectRow key={row.id} row={row} catalog={catalog} cards={cardsByProject.get(row.id) ?? []} onOpen={onOpen} />)}
      </div>
      <section aria-label="Work kept out of scope">
        <h2 className="border-b border-[var(--hair)] pb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Work kept out of scope</h2>
        {tasks.isLoading ? <p className="py-3 text-[length:var(--t-meta)] text-[var(--text-muted)]">Loading out-of-scope work…</p>
          : tasks.error ? <FailureState message="The not-doing list could not be read." action={{ label: "Retry", onClick: () => void tasks.refetch() }} />
          : keepingOut.length ? <div className="divide-y divide-[var(--hair)]">{keepingOut.map((task) => <Link key={task.id} to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.tasks}?record=${encodeURIComponent(task.id)}`} className="block py-3 text-[length:var(--t-ui)] hover:bg-[var(--hover)]">{task.title}</Link>)}</div>
          : <p className="py-3 text-[length:var(--t-meta)] text-[var(--text-muted)]">No out-of-scope work recorded for this workspace.</p>}
        {tasks.data && !tasks.data.complete && <p className="text-[length:var(--t-meta)] text-[var(--text-muted)]">Only the first 5,000 task records were read; this list may be incomplete.</p>}
      </section>
    </div>
  );
}

function WorkspaceProjectRow({ row, catalog, cards, onOpen }: { row: UnitChild; catalog: Awaited<ReturnType<typeof listWorkspaceDatabaseCatalog>>; cards: KanbanCard[]; onOpen: (row: UnitChild) => void }) {
  const summary = unitProjectSummary(row, catalog, cards);
  const linked = unitProjectRecords(row, catalog);
  const recordIds = [...(linked.initiative ? [linked.initiative.id] : []), ...linked.tasks.map((task) => task.id)];
  const latest = useQuery({ queryKey: ["unit-project-event", row.id, recordIds], queryFn: () => listWorkEvents({ recordIds, limit: 1 }), enabled: recordIds.length > 0, staleTime: 10_000, refetchInterval: 15_000 });
  const state = summary.waiting ? `A question for you: ${summary.waiting}` : latest.data?.[0]?.summary || summary.state || "No state recorded.";
  return <button type="button" onClick={() => onOpen(row)} className="block w-full space-y-2 py-4 text-left hover:bg-[var(--hover)]">
    <span className="block text-[length:var(--t-ui)] text-[var(--text)]">{row.name}</span>
    <span className={`block text-[length:var(--t-meta)] ${summary.waiting ? "text-[var(--question)]" : "text-[var(--text-muted)]"}`}>{state}</span>
    {summary.blocker && <span className="block text-[length:var(--t-meta)] text-[var(--text-muted)]">Unresolved: {summary.blocker}</span>}
    {summary.holder && <Identity name={summary.holder} />}
    {latest.error && <span className="block font-mono text-[10px] text-[var(--text-muted)]">Latest receipt unavailable.</span>}
  </button>;
}

function UnitTable({ rows, counts, onOpen }: { rows: UnitChild[]; counts: Map<string, number>; onOpen: (row: UnitChild) => void }) {
  return (
    <div role="table" aria-label="Projects" className="overflow-hidden rounded-[var(--r-ctl)] bg-[var(--raised)]">
      <div role="row" className="grid h-[var(--h-line)] grid-cols-[minmax(0,1fr)_140px_110px_100px] items-center gap-3 px-3 text-[length:var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <span role="columnheader">Project</span><span role="columnheader">Runs as</span><span role="columnheader">State</span><span role="columnheader">Evidence</span>
      </div>
      {rows.map((row) => {
        const count = countFor(counts, row);
        return (
          <button key={row.id} type="button" role="row" onClick={() => onOpen(row)} className="grid h-[var(--h-line)] w-full grid-cols-[minmax(0,1fr)_140px_110px_100px] items-center gap-3 px-3 text-left hover:bg-[var(--hover)]">
            <span role="cell" className="truncate text-[length:var(--t-ui)] text-[var(--text)]">{row.name}</span>
            <span role="cell" className="text-[length:var(--t-meta)] text-[var(--text-muted)]">—</span>
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
          <div className="mb-2 flex h-[var(--h-row)] items-center justify-between"><h2 className="text-[length:var(--t-section)] uppercase tracking-[0.12em] text-[var(--text-muted)]">{group.label}</h2><Pill>{group.rows.length}</Pill></div>
          <div className="grid gap-2">
            {group.rows.map((row) => <button key={row.id} type="button" onClick={() => onOpen(row)} className="text-left"><Card><div className="text-[length:var(--t-ui)] text-[var(--text)]">{row.name}</div><div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">{countFor(counts, row)} documents · —</div></Card></button>)}
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
      <p className="text-[length:var(--t-ui)] text-[var(--text)]">{rows.length} projects · {rows.filter((row) => row.caseLinked).length} client cases · {total} documents</p>
      <div className="grid gap-px overflow-hidden rounded-[var(--r-ctl)] bg-[var(--hair)]">
        {rows.map((row) => <button key={row.id} type="button" onClick={() => onOpen(row)} className="grid min-h-[var(--h-line)] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-[var(--base)] px-3 text-left hover:bg-[var(--hover)]"><span className="truncate text-[length:var(--t-ui)] text-[var(--text)]">{row.name}</span><Pill>{row.caseLinked ? "client case" : row.kind}</Pill><span className="font-mono text-[11px] text-[var(--text-muted)]">{countFor(counts, row)} docs</span></button>)}
      </div>
    </div>
  );
}
