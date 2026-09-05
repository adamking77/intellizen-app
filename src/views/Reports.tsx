import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { mergeVaultDocuments, recordVaultPath, visibleVaultFile } from "@/lib/docs-library";
import { DocsRail } from "@/components/docs/docs-rail";
import { DocumentPage } from "@/components/docs/document-page";
import { contextForRoute, publishConversationContext } from "@/lib/conversation-context";
import { composeDocument, documentPage } from "@/lib/document-editing";
import { documentSaveSessions } from "@/lib/document-save-session";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { QueryState } from "@/components/ui/query-state";
import {
  createRecordFromTemplate,
  deleteVaultFile,
  deleteWorkspaceRecord,
  DOCUMENTS_DB_FIELDS,
  GENZEN_WORKSPACE_DATABASE_IDS,
  getDocumentsWorkspaceBundle,
  listAllVaultFiles,
  listWorkflows,
  saveRecordAsTemplate,
  syncVaultFilesToDocumentRecords,
  updateWorkspaceRecord,
} from "@/lib/data";
import { createPortableDocument } from "@/lib/document-persistence";
import {
  documentDisplayTitle,
  documentFieldString,
  documentVaultRelativePath,
  isAbsoluteDocumentPath,
  quickNoteTitle,
  slugForDocumentTitle,
} from "@/lib/documents";
import { allProjects } from "@/lib/hierarchy";
import { toast, toastError } from "@/lib/toast";
import type {
  WorkspaceDatabaseRecord,
  WorkspaceDatabaseRecordModel,
  WorkspaceDatabaseBundle,
} from "@/lib/types";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { useHierarchy } from "@/lib/use-hierarchy";
import { readVaultFile, removeVaultFile, writeVaultFile, listVaultDocuments, createVaultDirectory } from "@/lib/vault";
import { useProposalCounts } from "@/proposals/use-proposals";
import { useAppStore } from "@/store";

const DOCS_RAIL_STORAGE_KEY = "intelizen:docs-rail";

function normalizeModelRecord(record: WorkspaceDatabaseRecord): WorkspaceDatabaseRecordModel {
  return {
    id: record.id,
    _body: record.body ?? undefined,
    _createdAt: record.created_at,
    _updatedAt: record.updated_at,
    _isTemplate: record.taxonomy?.is_template === true || undefined,
    ...record.fields,
  };
}

async function getVaultFileByPath(path: string) {
  const files = await listAllVaultFiles();
  return files.find((file) => file.file_path === path) ?? null;
}

async function readDocumentContent(record: WorkspaceDatabaseRecordModel) {
  const session = documentSaveSessions.get(record.id);
  if (session) return session.getSnapshot().text;
  const path = documentVaultRelativePath(record);
  if (path) { try { return await readVaultFile(path); } catch { /* Use the workspace copy when the file is unavailable. */ } }
  return String(record._body ?? "");
}

function creationTitle(template?: WorkspaceDatabaseRecordModel | null) {
  if (!template) return quickNoteTitle();
  const base = documentDisplayTitle(template).replace(/\s+template$/i, "").trim();
  return base || "Untitled document";
}

export function ReportsView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isCramped } = useWindowSize();
  const { tree } = useHierarchy();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("");
  const projectParam = searchParams.get("project");
  const selectedRecordId = searchParams.get("record");
  const [pendingDelete, setPendingDelete] = useState<WorkspaceDatabaseRecordModel | null>(null);
  const [railHidden, setRailHidden] = useState(false);
  const [railWidth, setRailWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(DOCS_RAIL_STORAGE_KEY));
      return Number.isFinite(stored) && stored >= 180 && stored <= 480 ? stored : 300;
    } catch {
      return 300;
    }
  });
  const vaultSyncStartedRef = useRef(false);
  const editAfterCreateRef = useRef<string | null>(null);

  const docsQuery = useQuery({
    queryKey: ["docs-workspace-bundle", entityFilter],
    queryFn: () => getDocumentsWorkspaceBundle(),
  });
  const vaultQuery = useQuery({ queryKey: ["docs-vault-inventory"], queryFn: listVaultDocuments, refetchInterval: 30000 });
  const workflowsQuery = useQuery({
    queryKey: ["workflow-registry", "docs", entityFilter],
    queryFn: () => listWorkflows({ entity: entityFilter, includeInactive: true, limit: 100 }),
  });

  useEffect(() => {
    if (vaultSyncStartedRef.current) return;
    vaultSyncStartedRef.current = true;
    void syncVaultFilesToDocumentRecords()
      .then(() => queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] }))
      .catch((error) => toastError("Couldn't sync vault documents", error));
  }, [queryClient]);

  const bundle = docsQuery.data ?? null;
  const sopRecords = useMemo(() => (workflowsQuery.data ?? [])
    .filter((workflow) => workflow.definition === null || workflow.definition === undefined)
    .map((workflow): WorkspaceDatabaseRecordModel => ({
      id: workflow.id,
      _body: workflow.body_preview,
      _createdAt: workflow.updated_at,
      _updatedAt: workflow.updated_at,
      [DOCUMENTS_DB_FIELDS.title]: workflow.name,
      [DOCUMENTS_DB_FIELDS.stage]: "Documented",
      [DOCUMENTS_DB_FIELDS.docType]: "workflow-sop",
      [DOCUMENTS_DB_FIELDS.entity]: workflow.entity ?? "genzen",
      [DOCUMENTS_DB_FIELDS.author]: workflow.owner_role ?? "",
    })), [workflowsQuery.data]);
  const sopRecordIds = useMemo(() => new Set(sopRecords.map((record) => record.id)), [sopRecords]);
  const workspaceRecords = useMemo(
    () =>
      [...(bundle?.records ?? [])
        .filter((record) =>
          !entityFilter ||
          record.entity === entityFilter ||
          record.fields[DOCUMENTS_DB_FIELDS.entity] === entityFilter
        )
        .filter((record) => !projectParam || record.fields[DOCUMENTS_DB_FIELDS.project] === projectParam)
        .map(normalizeModelRecord), ...(projectParam ? [] : sopRecords)]
        .sort((a, b) =>
          String(b[DOCUMENTS_DB_FIELDS.updatedAt] ?? b._updatedAt ?? "")
            .localeCompare(String(a[DOCUMENTS_DB_FIELDS.updatedAt] ?? a._updatedAt ?? ""))
        ),
    [bundle?.records, entityFilter, projectParam, sopRecords],
  );
  const allRecords = useMemo(() => mergeVaultDocuments(workspaceRecords, vaultQuery.data)
    .filter(record => { const path = recordVaultPath(record); return !path || visibleVaultFile(path); })
    .filter(record => {
      if (!record._vaultOnly) return true;
      if (projectParam) return false;
      if (!entityFilter) return true;
      const path = recordVaultPath(record) ?? "";
      const owner = /^(?:work|initiatives)\/([^/]+)/.exec(path)?.[1]?.replaceAll("-", "_");
      return !owner || owner === entityFilter;
    }), [workspaceRecords, vaultQuery.data, projectParam, entityFilter]);
  const projects = useMemo(() => allProjects(tree).map(({ id, name }) => ({ id, name })), [tree]);
  const proposalPaths = useMemo(() => allRecords.map(documentVaultRelativePath).filter((path): path is string => Boolean(path)), [allRecords]);
  const proposalCounts = useProposalCounts(proposalPaths);

  function selectDocument(id: string | null, replace = false) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("record", id); else next.delete("record");
      return next;
    }, { replace });
  }

  const selectedRecord = useMemo(
    () => allRecords.find((record) => record.id === selectedRecordId) ?? null,
    [allRecords, selectedRecordId],
  );
  useEffect(() => {
    if (!selectedRecord) return;
    const context = contextForRoute({ pathname: "/docs", search: searchParams.toString() });
    publishConversationContext({ ...context, selections: [selectedRecord._vaultOnly ? { kind: "vault_file", path: recordVaultPath(selectedRecord)!, label: documentDisplayTitle(selectedRecord) } : sopRecordIds.has(selectedRecord.id)
      ? { kind: "workspace_record", databaseId: GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry, recordId: selectedRecord.id, label: documentDisplayTitle(selectedRecord) }
      : { kind: "document", documentId: selectedRecord.id, label: documentDisplayTitle(selectedRecord) }] });
  }, [selectedRecord, searchParams, sopRecordIds]);
  useEffect(() => {
    try {
      window.localStorage.setItem(DOCS_RAIL_STORAGE_KEY, String(railWidth));
    } catch {
      /* keep the mounted preference */
    }
  }, [railWidth]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === "\\") {
        event.preventDefault();
        setRailHidden((hidden) => !hidden);
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);

  const createMutation = useMutation({
    mutationFn: async (template?: WorkspaceDatabaseRecordModel | null) => {
      if (!bundle?.database.id) throw new Error("Documents database is not ready.");
      const title = creationTitle(template);
      const templateContent = template ? await readDocumentContent(template) : "";
      const initialContent = template ? composeDocument(templateContent, title, documentPage(templateContent, title).body, template.id) : `# ${title}\n`;
      const entity = entityFilter ?? (documentFieldString(template ?? null, DOCUMENTS_DB_FIELDS.entity) || "genzen");
      const folder = `vault:${activeFolder || `journal/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`}`;
      const fields = {
        ...(template ? Object.fromEntries(
          Object.entries(template).filter(([key]) => !key.startsWith("_") && key !== "id"),
        ) : {}),
        [DOCUMENTS_DB_FIELDS.stage]: "Draft",
        [DOCUMENTS_DB_FIELDS.templateSource]: template?.id ?? null,
        ...(projectParam ? { [DOCUMENTS_DB_FIELDS.project]: projectParam } : {}),
      };
      return createPortableDocument({
        databaseId: bundle.database.id,
        title,
        body: initialContent,
        entity,
        author: "Adam",
        docType: template ? documentFieldString(template, DOCUMENTS_DB_FIELDS.docType) || "note" : "note",
        folder,
        fields,
        createRow: template
          ? (draft) => createRecordFromTemplate(template.id, {
              fields: draft.fields,
              body: draft.body,
              taxonomy: draft.taxonomy,
            })
          : undefined,
      });
    },
    onSuccess: ({ record, warning }) => {
      queryClient.setQueriesData<WorkspaceDatabaseBundle>(
        { queryKey: ["docs-workspace-bundle"] },
        (current) => current
          ? {
              ...current,
              records: [record, ...current.records.filter((item) => item.id !== record.id)],
            }
          : current,
      );
      selectDocument(record.id);
      editAfterCreateRef.current = record.id;
      void queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      void queryClient.invalidateQueries({ queryKey: ["docs-vault-inventory"] });
      if (warning) toast.info("Document created in Supabase only", { description: warning });
      else toast.success("Document created", { description: "Its Supabase row and markdown file are linked." });
    },
    onError: (error) => toastError("Couldn't create document", error),
  });

  const templateMutation = useMutation({
    mutationFn: async (source: WorkspaceDatabaseRecordModel) => {
      const sourceContent = await readDocumentContent(source);
      const now = new Date().toISOString();
      const title = `${documentDisplayTitle(source).replace(/\s+template$/i, "")} template`;
      const template = await saveRecordAsTemplate(source.id, {
        fields: {
          [DOCUMENTS_DB_FIELDS.title]: title,
          [DOCUMENTS_DB_FIELDS.vaultPath]: null,
          [DOCUMENTS_DB_FIELDS.author]: "Adam",
          [DOCUMENTS_DB_FIELDS.templateSource]: source.id,
          [DOCUMENTS_DB_FIELDS.createdAt]: now,
          [DOCUMENTS_DB_FIELDS.updatedAt]: now,
        },
        body: sourceContent,
      });
      const portableContent = composeDocument(sourceContent, title, documentPage(sourceContent, title).body, template.id);
      const path = `vault:templates/${slugForDocumentTitle(title)}-${Date.now()}.md`;
      await writeVaultFile(path, portableContent);
      return updateWorkspaceRecord(template.id, {
        fields: { ...template.fields, [DOCUMENTS_DB_FIELDS.vaultPath]: path },
        body: portableContent,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      toast.success("Template saved", { description: "It now appears in the New document menu." });
    },
    onError: (error) => toastError("Couldn't save template", error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (record: WorkspaceDatabaseRecordModel) => {
      const session = documentSaveSessions.get(record.id);
      if (session) await session.flush();
      const vaultPath = documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath);
      const matchedFile = vaultPath ? await getVaultFileByPath(vaultPath) : null;
      // Remove the recoverable workspace row first. If local cleanup fails, a
      // leftover file is safer than a row that points at content we already
      // destroyed.
      await deleteWorkspaceRecord(record.id);
      let cleanupWarning: string | null = null;
      try {
        if (vaultPath && !isAbsoluteDocumentPath(vaultPath)) await removeVaultFile(vaultPath);
        if (matchedFile) await deleteVaultFile(matchedFile.id);
      } catch (cleanupError) {
        cleanupWarning = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      }
      return {
        keptExternalFile: Boolean(vaultPath && isAbsoluteDocumentPath(vaultPath)),
        cleanupWarning,
      };
    },
    onSuccess: async ({ keptExternalFile, cleanupWarning }) => {
      setPendingDelete(null);
      selectDocument(null);
      await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      if (cleanupWarning) {
        toast.info("Document row deleted; file cleanup needs attention", { description: cleanupWarning });
      } else {
        toast.success("Document deleted", {
          description: keptExternalFile
            ? "The Supabase row was removed. The file outside the vault was left untouched."
            : "The Supabase row and its vault file were removed.",
        });
      }
    },
    onError: (error) => toastError("Couldn't delete document", error),
  });

  if (docsQuery.isLoading && vaultQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--base)] p-6">
        <QueryState isLoading error={undefined} isEmpty={false} loadingLabel="Loading documents" onRetry={() => void docsQuery.refetch()}>
          {null}
        </QueryState>
      </div>
    );
  }

  if (docsQuery.error && !docsQuery.data && !vaultQuery.data) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--base)] p-6">
        <QueryState isLoading={false} error={docsQuery.error} isEmpty={false} errorTitle="Docs unavailable" onRetry={() => void docsQuery.refetch()}>
          {null}
        </QueryState>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--base)]">
      {(isCramped ? !selectedRecordId : !railHidden) ? (
        <DocsRail
          records={allRecords}
          projects={projects}
          proposalCounts={proposalCounts}
          selectedRecordId={selectedRecordId}
          searchQuery={searchQuery}
          width={isCramped ? "100%" : railWidth}
          creating={createMutation.isPending}
          inventory={vaultQuery.data}
          loadingVault={vaultQuery.isLoading}
          vaultError={vaultQuery.error}
          workspaceError={docsQuery.error}
          activeFolder={activeFolder}
          onFolder={setActiveFolder}
          onRefresh={() => { void vaultQuery.refetch(); void docsQuery.refetch(); }}
          onCreateFolder={async name => {
            const trimmed = name.trim();
            if (!trimmed || /[\\/:]/.test(trimmed) || trimmed.startsWith(".")) throw new Error("Use a folder name without slashes or a leading dot.");
            await createVaultDirectory([activeFolder, trimmed].filter(Boolean).join("/"), "vault");
            await vaultQuery.refetch();
          }}
          onSearch={setSearchQuery}
          onSelect={selectDocument}
          onCreate={(template) => createMutation.mutate(template)}
          onResize={setRailWidth}
        />
      ) : null}
        <section className={cn(
          "relative min-w-0 flex-1 flex-col overflow-hidden",
          isCramped && !selectedRecordId ? "hidden" : "flex",
        )}>
          {selectedRecordId && !selectedRecord && !workflowsQuery.isLoading ? <QueryState className="p-6" isLoading={false} error="This document is unavailable in the current scope. Choose a document from the list." isEmpty={false} errorTitle="Document unavailable" onRetry={() => void Promise.all([docsQuery.refetch(), workflowsQuery.refetch()])}>{null}</QueryState> : selectedRecord ? (
            <DocumentPage
              key={selectedRecord.id}
              record={selectedRecord}
              workflow={sopRecordIds.has(selectedRecord.id) ? workflowsQuery.data?.find((item) => item.id === selectedRecord.id) : undefined}
              projects={projects}
              initialEdit={editAfterCreateRef.current === selectedRecord.id}
              isCramped={isCramped}
              savingTemplate={templateMutation.isPending}
              onBack={() => isCramped ? selectDocument(null) : setRailHidden((hidden) => !hidden)}
              onReturnToList={() => { selectDocument(null); setRailHidden(false); }}
              onSaveTemplate={() => templateMutation.mutate(selectedRecord)}
              onMakeRunnable={() => navigate(`/workflows?workflow=${encodeURIComponent(selectedRecord.id)}&view=steps`)}
              onDelete={() => setPendingDelete(selectedRecord)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-label">{allRecords.length === 0 ? "No documents" : "Select a document"}</p>
              <p className="max-w-[440px] text-ui text-[var(--subtext-0)]">
                Your documents, notes, and workflow sources live here.
                Choose a document, create one from a template, or capture a quick note.
              </p>
            </div>
          )}
        </section>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete document"
        message={pendingDelete && isAbsoluteDocumentPath(documentFieldString(pendingDelete, DOCUMENTS_DB_FIELDS.vaultPath))
          ? "Delete this document row? Its file is outside the GenZen OS vault and will be left untouched."
          : "Delete this document row and its linked markdown file? This cannot be undone."}
        confirmLabel={deleteMutation.isPending ? "Deleting…" : "Delete"}
        danger
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
