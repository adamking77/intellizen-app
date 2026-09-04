import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ProjectBoard } from "@/components/project/project-board";
import { ProjectSessions } from "@/components/project/project-sessions";
import { DrawerActions, ProjectBrief, ProjectEvidenceTable, ProjectTimeline } from "@/components/project/project-views";
import { ProjectCanvases, ProjectGraph } from "@/components/project/project-visuals";
import { Control } from "@/components/ui/control";
import { Drawer } from "@/components/ui/drawer";
import { Identity } from "@/components/ui/identity";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { Segmented } from "@/components/ui/segmented";
import { Pill } from "@/components/ui/status-pill";
import { getDocumentsWorkspaceBundle, listCanvasDocuments, listInvestigations, listWorkspaceDatabaseCatalog } from "@/lib/data";
import { listGraphNodes } from "@/lib/data/graph";
import { createPortableDocument } from "@/lib/document-persistence";
import { DOCUMENTS_DB_FIELDS, quickNoteTitle } from "@/lib/documents";
import { locate } from "@/lib/hierarchy";
import { breadcrumb, findProjectNode, projectDocuments, shortenHome } from "@/lib/project-center";
import { linkedWorkspaceRecords, loadRoomView, projectRoomViews, saveRoomView, type ProjectLinkedRecord, type ProjectRoomView } from "@/lib/project-room";
import { toast, toastError } from "@/lib/toast";
import type { WorkspaceDatabaseRecord } from "@/lib/types";
import { useHierarchy } from "@/lib/use-hierarchy";
import { CENTER_DOCS_QUERY_KEY } from "@/views/Unit";

type EvidenceSelection =
  | { kind: "document"; record: WorkspaceDatabaseRecord }
  | { kind: "record"; record: ProjectLinkedRecord };

function value(record: WorkspaceDatabaseRecord, field: string) {
  const result = record.fields[field];
  return typeof result === "string" ? result : "";
}

function documentTitle(record: WorkspaceDatabaseRecord) {
  return value(record, DOCUMENTS_DB_FIELDS.title).trim() || "Untitled document";
}

const VIEW_LABELS: Record<ProjectRoomView, string> = {
  brief: "Brief", table: "Table", board: "Board", graph: "Graph", timeline: "Timeline", session: "Session", canvas: "Canvas",
};

/** A hierarchy project rendered as one room with material-specific views. */
export function ProjectView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tree, isLoading, error } = useHierarchy();
  const node = findProjectNode(tree, id);
  const scoped = locate(tree, { kind: "project", id });
  const investigationId = node?.legacy_investigation_id ?? null;
  const legacyProjectId = node?.legacy_project_id ?? null;
  const clientCase = investigationId != null;
  const views = useMemo(() => projectRoomViews(clientCase), [clientCase]);
  const [view, setView] = useState<ProjectRoomView>(() => loadRoomView(id, projectRoomViews(false)));
  const [selected, setSelected] = useState<EvidenceSelection | null>(null);
  const selectedSessionKey = searchParams.get("session");

  useEffect(() => setView(loadRoomView(id, views)), [id, views]);
  useEffect(() => {
    if (selectedSessionKey) setView("session");
  }, [selectedSessionKey]);

  const chooseView = (next: ProjectRoomView) => {
    setView(next);
    saveRoomView(id, next);
    if (selectedSessionKey) setSearchParams({}, { replace: true });
  };

  const docs = useQuery({ queryKey: CENTER_DOCS_QUERY_KEY, queryFn: () => getDocumentsWorkspaceBundle() });
  const files = useMemo(() => projectDocuments(docs.data?.records ?? [], id), [docs.data?.records, id]);
  const catalog = useQuery({ queryKey: ["workspace-database-catalog", "project-room"], queryFn: () => listWorkspaceDatabaseCatalog() });
  const linkedRecords = useMemo(() => linkedWorkspaceRecords(catalog.data ?? [], id, legacyProjectId), [catalog.data, id, legacyProjectId]);
  const canvases = useQuery({ queryKey: ["canvas-documents"], queryFn: listCanvasDocuments });
  const projectCanvases = useMemo(
    () => legacyProjectId == null ? [] : (canvases.data ?? []).filter((canvas) => canvas.project_id === legacyProjectId),
    [canvases.data, legacyProjectId],
  );
  const graphNodes = useQuery({
    queryKey: ["graph-nodes", legacyProjectId],
    queryFn: () => listGraphNodes(legacyProjectId!),
    enabled: legacyProjectId != null,
  });
  const investigations = useQuery({
    queryKey: ["investigations", "project-room"],
    queryFn: () => listInvestigations(),
    enabled: investigationId != null,
  });
  const investigation = investigations.data?.find((candidate) => candidate.id === investigationId) ?? null;
  const notFound = !isLoading && !error && !node ? "No project with this id is in the tree." : undefined;

  const create = useMutation({
    mutationFn: async () => {
      if (!docs.data?.database.id) throw new Error("Documents database is not ready.");
      const title = quickNoteTitle();
      return createPortableDocument({
        databaseId: docs.data.database.id,
        title,
        body: `# ${title}\n`,
        entity: "genzen",
        author: "Adam",
        fields: { [DOCUMENTS_DB_FIELDS.stage]: "Draft", [DOCUMENTS_DB_FIELDS.project]: id },
      });
    },
    onSuccess: async ({ record, warning }) => {
      await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      if (warning) toast.info("Document created in Supabase only", { description: warning });
      navigate(`/docs?record=${record.id}&project=${id}`);
    },
    onError: (err) => toastError("Couldn't create document", err),
  });

  const openSelection = () => {
    if (!selected) return;
    if (selected.kind === "document") navigate(`/docs?record=${selected.record.id}&project=${id}`);
    else navigate(`/databases/${selected.record.databaseId}?record=${selected.record.recordId}`);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="shrink-0 px-5 py-3">
        <PageHeader
          title={node?.name ?? "Project"}
          breadcrumb={scoped?.path.length ? breadcrumb(scoped) : undefined}
          state={node?.folders.length ? node.folders.map(shortenHome).join(" · ") : `${files.length} documents`}
          views={node ? (
            <Segmented value={view} options={views.map((candidate) => ({ value: candidate, label: VIEW_LABELS[candidate] }))} onValueChange={chooseView} label="Project view" transitionKind="room" />
          ) : undefined}
          action={node ? <Control variant="primary" loading={create.isPending} onClick={() => create.mutate()}>New document</Control> : undefined}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={{ viewTransitionName: "project-room-view" }}>
      {!node ? (
        <div className="min-h-0 flex-1 p-5">
          <QueryState isLoading={isLoading} error={error ?? notFound} isEmpty={false} loadingLabel="Loading project" errorTitle="Project unavailable">{null}</QueryState>
        </div>
      ) : view === "brief" ? (
        <QueryState className="m-5" isLoading={docs.isLoading || catalog.isLoading || investigations.isLoading} error={docs.error ?? catalog.error ?? investigations.error} isEmpty={false} loadingLabel="Loading brief" errorTitle="Brief unavailable" onRetry={() => void Promise.all([docs.refetch(), catalog.refetch(), investigations.refetch()])}>
          <ProjectBrief clientCase={clientCase} files={files} linkedRecords={linkedRecords} graphCount={graphNodes.data?.length ?? 0} investigation={investigation} />
        </QueryState>
      ) : view === "table" ? (
        <QueryState className="m-5" isLoading={docs.isLoading || catalog.isLoading} error={docs.error ?? catalog.error} isEmpty={files.length + linkedRecords.length === 0} loadingLabel="Loading evidence" errorTitle="Evidence unavailable" emptyTitle="No evidence yet" emptyDescription="Documents and database records linked to this project appear here." onRetry={() => void Promise.all([docs.refetch(), catalog.refetch()])}>
          <ProjectEvidenceTable files={files} linkedRecords={linkedRecords} onOpenDocument={(record) => setSelected({ kind: "document", record })} onOpenRecord={(record) => setSelected({ kind: "record", record })} />
        </QueryState>
      ) : view === "board" ? (
        <ProjectBoard folders={node.folders} />
      ) : view === "session" ? (
        <ProjectSessions folders={node.folders} projectId={id} selectedSessionKey={selectedSessionKey} transcriptOnly={Boolean(selectedSessionKey)} />
      ) : view === "canvas" ? (
        <ProjectCanvases canvases={projectCanvases} />
      ) : view === "graph" && legacyProjectId != null ? (
        <ProjectGraph projectId={legacyProjectId} nodes={graphNodes.data ?? []} />
      ) : view === "timeline" ? (
        <ProjectTimeline files={files} investigation={investigation} onOpenDocument={(record) => setSelected({ kind: "document", record })} />
      ) : (
        <p className="p-5 text-[var(--t-ui)] text-[var(--text-muted)]">This view will appear when the project has linked material.</p>
      )}
      </div>

      <Drawer open={selected != null} onClose={() => setSelected(null)} label={selected?.kind === "document" ? documentTitle(selected.record) : selected?.record.title ?? "Evidence details"}>
        {selected ? (
          <div className="grid gap-5 p-4">
            <div>
              <div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">{selected.kind === "document" ? "Document" : selected.record.databaseName}</div>
              <h2 className="mt-1 text-[var(--t-title)] text-[var(--text)]">{selected.kind === "document" ? documentTitle(selected.record) : selected.record.title}</h2>
            </div>
            {selected.kind === "document" ? (
              <>
                {value(selected.record, DOCUMENTS_DB_FIELDS.author) ? <Identity name={value(selected.record, DOCUMENTS_DB_FIELDS.author)} runtime="hermes" /> : <span className="text-[var(--t-meta)] text-[var(--text-muted)]">— unassigned</span>}
                <Pill>{value(selected.record, DOCUMENTS_DB_FIELDS.stage) || "document"}</Pill>
              </>
            ) : selected.record.status ? <Pill>{selected.record.status}</Pill> : <span className="text-[var(--t-meta)] text-[var(--text-muted)]">— unassigned</span>}
            <DrawerActions onOpen={openSelection} />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
