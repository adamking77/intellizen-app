import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ProjectBoard } from "@/components/project/project-board";
import { ProjectFileView } from "@/components/project/project-file-view";
import { ProjectSessions } from "@/components/project/project-sessions";
import { DrawerActions, ProjectBrief, ProjectEntities, ProjectEvidenceTable, ProjectTimeline } from "@/components/project/project-views";
import { ProjectCanvases, ProjectGraph } from "@/components/project/project-visuals";
import { Control } from "@/components/ui/control";
import { Drawer } from "@/components/ui/drawer";
import { Identity } from "@/components/ui/identity";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { Segmented } from "@/components/ui/segmented";
import { Pill } from "@/components/ui/status-pill";
import { getDocumentsWorkspaceBundle, listCanvasDocuments, listInvestigations, listInvestigationSignals, listWorkspaceDatabaseCatalog } from "@/lib/data";
import { listIntelEntities } from "@/lib/data/osint";
import { listGraphNodes } from "@/lib/data/graph";
import { createPortableDocument } from "@/lib/document-persistence";
import { DOCUMENTS_DB_FIELDS, quickNoteTitle } from "@/lib/documents";
import { locate } from "@/lib/hierarchy";
import { breadcrumb, findProjectNode, projectDocuments, shortenHome } from "@/lib/project-center";
import { linkedWorkspaceRecords, loadRoomView, projectRoomViews, saveRoomView, type ProjectLinkedRecord, type ProjectRoomView } from "@/lib/project-room";
import { toast, toastError } from "@/lib/toast";
import type { IntelEntity, InvestigationSignal, WorkspaceDatabaseRecord } from "@/lib/types";
import { useHierarchy } from "@/lib/use-hierarchy";
import { listProjectFiles, type ProjectFile } from "@/services/project-files";
import { CENTER_DOCS_QUERY_KEY } from "@/views/Unit";

type EvidenceSelection =
  | { kind: "document"; record: WorkspaceDatabaseRecord }
  | { kind: "file"; file: ProjectFile }
  | { kind: "record"; record: ProjectLinkedRecord }
  | { kind: "signal"; signal: InvestigationSignal }
  | { kind: "entity"; entity: IntelEntity };

function value(record: WorkspaceDatabaseRecord, field: string) {
  const result = record.fields[field];
  return typeof result === "string" ? result : "";
}

function documentTitle(record: WorkspaceDatabaseRecord) {
  return value(record, DOCUMENTS_DB_FIELDS.title).trim() || "Untitled document";
}

const VIEW_LABELS: Record<ProjectRoomView, string> = {
  brief: "Brief", table: "Table", case: "Case", evidence: "Evidence", entities: "Entities", board: "Board", graph: "Graph", timeline: "Timeline", session: "Session", canvas: "Canvas",
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
    const requested = searchParams.get("tab") as ProjectRoomView | null;
    if (requested && views.includes(requested)) setView(requested);
  }, [searchParams, views]);
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
  const folderFiles = useQuery({
    queryKey: ["project-folder-files", id, node?.folders],
    queryFn: () => listProjectFiles(node!.folders),
    enabled: Boolean(node?.folders.length),
  });
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
  const investigationSignals = useQuery({
    queryKey: ["investigation-signals", investigationId],
    queryFn: () => listInvestigationSignals(investigationId!),
    enabled: investigationId != null,
  });
  const entities = useQuery({
    queryKey: ["intel-entities", investigation?.case_id],
    queryFn: () => listIntelEntities({ caseId: investigation!.case_id }),
    enabled: Boolean(investigation?.case_id),
  });
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
    if (!selected || selected.kind === "file") return;
    if (selected.kind === "document") navigate(`/docs?record=${selected.record.id}&project=${id}`);
    else if (selected.kind === "record") navigate(`/databases/${selected.record.databaseId}?record=${selected.record.recordId}`);
    else if (selected.kind === "signal" && selected.signal.intel_signals?.url) window.open(selected.signal.intel_signals.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="shrink-0 px-5 py-3">
        <PageHeader
          title={selectedSessionKey ? "Session" : node?.name ?? "Project"}
          breadcrumb={selectedSessionKey ? [...(scoped?.path ?? []), node?.name ?? "Project"].join(" / ") : scoped?.path.length ? breadcrumb(scoped) : undefined}
          state={selectedSessionKey ? "Read only" : node?.folders.length ? node.folders.map(shortenHome).join(" · ") : `${files.length} documents`}
          views={node && !selectedSessionKey ? (
            <Segmented value={view} options={views.map((candidate) => ({ value: candidate, label: VIEW_LABELS[candidate] }))} onValueChange={chooseView} label="Project view" transitionKind="room" />
          ) : undefined}
          action={node && !selectedSessionKey ? <Control variant="primary" loading={create.isPending} onClick={() => create.mutate()}>New document</Control> : undefined}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={{ viewTransitionName: "project-room-view" }}>
      {!node ? (
        <div className="min-h-0 flex-1 p-5">
          <QueryState isLoading={isLoading} error={error ?? notFound} isEmpty={false} loadingLabel="Loading project" errorTitle="Project unavailable">{null}</QueryState>
        </div>
      ) : view === "brief" || view === "case" ? (
        <QueryState className="m-5" isLoading={docs.isLoading || catalog.isLoading || investigations.isLoading} error={docs.error ?? catalog.error ?? investigations.error} isEmpty={false} loadingLabel="Loading brief" errorTitle="Brief unavailable" onRetry={() => void Promise.all([docs.refetch(), catalog.refetch(), investigations.refetch()])}>
          <ProjectBrief clientCase={clientCase} files={files} linkedRecords={linkedRecords} graphCount={graphNodes.data?.length ?? 0} investigation={investigation} />
        </QueryState>
      ) : view === "table" || view === "evidence" ? (
        <QueryState className="m-5" isLoading={docs.isLoading || catalog.isLoading || folderFiles.isLoading || investigationSignals.isLoading} error={docs.error ?? catalog.error ?? folderFiles.error ?? investigationSignals.error} isEmpty={files.length + linkedRecords.length + (folderFiles.data?.length ?? 0) + (investigationSignals.data?.length ?? 0) === 0} loadingLabel="Loading evidence" errorTitle="Evidence unavailable" emptyTitle="No evidence yet" emptyDescription="Signals, workspace documents, linked records, and files in this project's folder appear here." onRetry={() => void Promise.all([docs.refetch(), catalog.refetch(), folderFiles.refetch(), investigationSignals.refetch()])}>
          <ProjectEvidenceTable files={files} folderFiles={folderFiles.data} linkedRecords={linkedRecords} signals={investigationSignals.data} onOpenDocument={(record) => setSelected({ kind: "document", record })} onOpenFile={(file) => setSelected({ kind: "file", file })} onOpenRecord={(record) => setSelected({ kind: "record", record })} onOpenSignal={(signal) => setSelected({ kind: "signal", signal })} />
        </QueryState>
      ) : view === "entities" ? (
        <QueryState className="m-5" isLoading={entities.isLoading} error={entities.error} isEmpty={(entities.data?.length ?? 0) === 0} loadingLabel="Loading entities" errorTitle="Entities unavailable" emptyTitle="No entities yet" emptyDescription="People, organizations, objects, locations, and events appear after they are linked to this case." onRetry={() => void entities.refetch()}>
          <ProjectEntities entities={entities.data ?? []} onOpen={(entity) => setSelected({ kind: "entity", entity })} />
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

      <Drawer open={selected != null} onClose={() => setSelected(null)} label={selected?.kind === "document" ? documentTitle(selected.record) : selected?.kind === "file" ? selected.file.title : selected?.kind === "record" ? selected.record.title : selected?.kind === "signal" ? selected.signal.intel_signals?.title ?? "Signal" : selected?.entity.name ?? "Evidence details"}>
        {selected ? (
          <div className="grid gap-5 p-4">
            {selected.kind === "file" ? <ProjectFileView file={selected.file} folders={node?.folders ?? []} /> : selected.kind === "entity" ? <>
              <div>
                <div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">{selected.entity.entity_type}</div>
                <h2 className="mt-1 text-[var(--t-title)] text-[var(--text)]">{selected.entity.name}</h2>
              </div>
              {selected.entity.confidence ? <Pill>{selected.entity.confidence}</Pill> : null}
              {selected.entity.aliases.length ? <p className="text-[var(--t-meta)] text-[var(--text-muted)]">Also known as {selected.entity.aliases.join(", ")}</p> : null}
              <p className="text-[var(--t-ui)] text-[var(--text)]">{selected.entity.summary || "No summary yet."}</p>
            </> : selected.kind === "signal" ? <>
              <div>
                <div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">Signal · {selected.signal.intel_signals?.source || "unknown source"}</div>
                <h2 className="mt-1 text-[var(--t-title)] text-[var(--text)]">{selected.signal.intel_signals?.title || "Untitled signal"}</h2>
              </div>
              <p className="text-[var(--t-ui)] text-[var(--text)]">{selected.signal.intel_signals?.snippet || "No excerpt available."}</p>
              {selected.signal.intel_signals?.url ? <DrawerActions onOpen={openSelection} /> : null}
            </> : <>
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
            </>}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
