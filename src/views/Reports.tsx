import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { DocsRail } from "@/components/docs/docs-rail";
import { DocumentHeader, type DocumentMode, type DocumentSaveStatus } from "@/components/docs/document-header";
import { GraphEmbeds } from "@/components/docs/graph-embed";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { QueryState } from "@/components/ui/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createRecordFromTemplate,
  deleteVaultFile,
  deleteWorkspaceRecord,
  DOCUMENTS_DB_FIELDS,
  getDocumentsWorkspaceBundle,
  getVaultFile,
  listAllVaultFiles,
  saveRecordAsTemplate,
  syncVaultFilesToDocumentRecords,
  updateVaultFileContent,
  updateWorkspaceRecord,
} from "@/lib/data";
import { createPortableDocument } from "@/lib/document-persistence";
import {
  documentAttachmentLabel,
  documentDisplayTitle,
  documentEditableBody,
  documentFieldString,
  documentVaultRelativePath,
  isAbsoluteDocumentPath,
  quickNoteTitle,
  safeDocumentFolder,
  slugForDocumentTitle,
  upsertDocumentFrontmatterId,
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
import { readVaultFile, removeVaultFile, writeVaultFile } from "@/lib/vault";
import { ProposalStrip } from "@/proposals/proposal-strip";
import { useProposalCounts } from "@/proposals/use-proposals";
import { useAppStore } from "@/store";

const InlineMarkdownEditor = lazy(async () => {
  const module = await import("@/components/reports/inline-markdown-editor");
  return { default: module.InlineMarkdownEditor };
});

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

function EditorFallback() {
  return <Skeleton lines={5} className="py-4" />;
}

function formatDocumentDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

async function getVaultFileByPath(path: string) {
  const files = await listAllVaultFiles();
  return files.find((file) => file.file_path === path) ?? null;
}

async function readDocumentContent(record: WorkspaceDatabaseRecordModel) {
  const vaultPath = documentVaultRelativePath(record);
  if (vaultPath) {
    try {
      const matchedFile = await getVaultFileByPath(vaultPath);
      if (matchedFile) {
        const file = await getVaultFile(matchedFile.id);
        if (file.content !== null) return file.content;
      }
    } catch {
      // A local file can still be healthy when its Supabase mirror is unavailable.
    }
    return readVaultFile(vaultPath);
  }
  return String(record._body ?? "");
}

function creationTitle(template?: WorkspaceDatabaseRecordModel | null) {
  if (!template) return quickNoteTitle();
  const base = documentDisplayTitle(template).replace(/\s+template$/i, "").trim();
  return base || "Untitled document";
}

export function ReportsView() {
  const queryClient = useQueryClient();
  const { isCramped } = useWindowSize();
  const { tree } = useHierarchy();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const projectParam = searchParams.get("project");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(() => searchParams.get("record"));
  const [pendingDelete, setPendingDelete] = useState<WorkspaceDatabaseRecordModel | null>(null);
  const [content, setContent] = useState("");
  const [persistedContent, setPersistedContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<DocumentSaveStatus>("idle");
  const [mode, setMode] = useState<DocumentMode>("read");
  const [railHidden, setRailHidden] = useState(false);
  const [railWidth, setRailWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(DOCS_RAIL_STORAGE_KEY));
      return Number.isFinite(stored) && stored >= 180 && stored <= 480 ? stored : 300;
    } catch {
      return 300;
    }
  });
  const [saveAttempt, setSaveAttempt] = useState(0);
  const latestContentRef = useRef("");
  const vaultSyncStartedRef = useRef(false);

  const docsQuery = useQuery({
    queryKey: ["docs-workspace-bundle", entityFilter],
    queryFn: () => getDocumentsWorkspaceBundle(),
  });

  useEffect(() => {
    if (vaultSyncStartedRef.current) return;
    vaultSyncStartedRef.current = true;
    void syncVaultFilesToDocumentRecords()
      .then(() => queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] }))
      .catch((error) => toastError("Couldn't sync vault documents", error));
  }, [queryClient]);

  const bundle = docsQuery.data ?? null;
  const allRecords = useMemo(
    () =>
      (bundle?.records ?? [])
        .filter((record) =>
          !entityFilter ||
          record.entity === entityFilter ||
          record.fields[DOCUMENTS_DB_FIELDS.entity] === entityFilter
        )
        .filter((record) => !projectParam || record.fields[DOCUMENTS_DB_FIELDS.project] === projectParam)
        .map(normalizeModelRecord)
        .sort((a, b) =>
          String(b[DOCUMENTS_DB_FIELDS.updatedAt] ?? b._updatedAt ?? "")
            .localeCompare(String(a[DOCUMENTS_DB_FIELDS.updatedAt] ?? a._updatedAt ?? ""))
        ),
    [bundle?.records, entityFilter, projectParam],
  );
  const projects = useMemo(() => allProjects(tree).map(({ id, name }) => ({ id, name })), [tree]);
  const proposalPaths = useMemo(() => allRecords.map(documentVaultRelativePath).filter((path): path is string => Boolean(path)), [allRecords]);
  const proposalCounts = useProposalCounts(proposalPaths);

  useEffect(() => {
    if (selectedRecordId && allRecords.some((record) => record.id === selectedRecordId)) return;
    if (isCramped) {
      if (selectedRecordId) setSelectedRecordId(null);
      return;
    }
    setSelectedRecordId(allRecords.find((record) => !record._isTemplate)?.id ?? allRecords[0]?.id ?? null);
  }, [allRecords, selectedRecordId, isCramped]);

  const selectedRecord = useMemo(
    () => allRecords.find((record) => record.id === selectedRecordId) ?? null,
    [allRecords, selectedRecordId],
  );
  const selectedVaultPath = documentVaultRelativePath(selectedRecord);
  const selectedTitle = selectedRecord ? documentDisplayTitle(selectedRecord) : "Untitled document";
  const selectedProject = projects.find((project) => project.id === documentFieldString(selectedRecord, DOCUMENTS_DB_FIELDS.project));

  const vaultFileQuery = useQuery({
    queryKey: ["docs-vault-content", selectedRecordId, selectedVaultPath],
    queryFn: async () => selectedRecord
      ? documentEditableBody(await readDocumentContent(selectedRecord))
      : "",
    enabled: !!selectedRecord,
    retry: false,
  });

  useEffect(() => {
    if (vaultFileQuery.data === undefined) return;
    const nextContent = vaultFileQuery.data;
    latestContentRef.current = nextContent;
    setContent(nextContent);
    setPersistedContent(nextContent);
    setSaveStatus("idle");
  }, [selectedRecordId, vaultFileQuery.data]);

  useEffect(() => {
    if (!selectedRecord) return;
    const author = documentFieldString(selectedRecord, DOCUMENTS_DB_FIELDS.author);
    setMode(/^(adam|you)$/i.test(author.trim()) ? "edit" : "read");
  }, [selectedRecord]);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

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
      if (event.metaKey && event.key.toLowerCase() === "e" && selectedRecord) {
        event.preventDefault();
        setMode((current) => current === "edit" ? "read" : "edit");
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [selectedRecord]);

  const createMutation = useMutation({
    mutationFn: async (template?: WorkspaceDatabaseRecordModel | null) => {
      if (!bundle?.database.id) throw new Error("Documents database is not ready.");
      const title = creationTitle(template);
      const initialContent = template ? await readDocumentContent(template) : `# ${title}\n`;
      const entity = entityFilter ?? (documentFieldString(template ?? null, DOCUMENTS_DB_FIELDS.entity) || "genzen");
      const folder = safeDocumentFolder(documentFieldString(template ?? null, DOCUMENTS_DB_FIELDS.folder));
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
      setSelectedRecordId(record.id);
      setMode("edit");
      void queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
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
      const portableContent = upsertDocumentFrontmatterId(sourceContent, template.id);
      const path = `documents/templates/${slugForDocumentTitle(title)}-${Date.now()}.md`;
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
      setSelectedRecordId(null);
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

  useEffect(() => {
    if (!selectedRecord || content === persistedContent || saveStatus !== "dirty") return;
    const recordId = selectedRecord.id;
    const vaultPath = selectedVaultPath;
    const nextContent = upsertDocumentFrontmatterId(content, recordId);
    const timer = window.setTimeout(async () => {
      try {
        setSaveStatus("saving");
        const matchedFile = vaultPath ? await getVaultFileByPath(vaultPath) : null;
        if (matchedFile) await updateVaultFileContent(matchedFile.id, nextContent);
        if (vaultPath) await writeVaultFile(vaultPath, nextContent);
        await updateWorkspaceRecord(recordId, {
          body: nextContent,
          fieldId: DOCUMENTS_DB_FIELDS.updatedAt,
          value: new Date().toISOString(),
        });
        setPersistedContent(content);
        setSaveStatus(latestContentRef.current !== content ? "dirty" : "saved");
        await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      } catch (error) {
        setSaveStatus("error");
        toastError("Couldn't save document", error);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [content, persistedContent, queryClient, saveAttempt, saveStatus, selectedRecord, selectedVaultPath]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = window.setTimeout(() => setSaveStatus("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  if (docsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--base)] p-6">
        <QueryState isLoading error={undefined} isEmpty={false} loadingLabel="Loading documents" onRetry={() => void docsQuery.refetch()}>
          {null}
        </QueryState>
      </div>
    );
  }

  if (docsQuery.error) {
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
      {(!railHidden || isCramped) ? (
        <DocsRail
          records={allRecords}
          projects={projects}
          proposalCounts={proposalCounts}
          selectedRecordId={selectedRecordId}
          searchQuery={searchQuery}
          width={isCramped ? "100%" : railWidth}
          creating={createMutation.isPending}
          onSearch={setSearchQuery}
          onSelect={setSelectedRecordId}
          onCreate={(template) => createMutation.mutate(template)}
          onResize={setRailWidth}
        />
      ) : null}
        <section className={cn(
          "relative min-w-0 flex-1 flex-col overflow-hidden",
          isCramped && !selectedRecordId ? "hidden" : "flex",
        )}>
          {selectedRecord ? (
            <>
              <DocumentHeader
                breadcrumb={selectedProject ? `Docs / ${selectedProject.name}` : "Docs / Unfiled"}
                mode={mode}
                saveStatus={saveStatus}
                inVault={Boolean(selectedVaultPath)}
                isTemplate={Boolean(selectedRecord._isTemplate)}
                isCramped={isCramped}
                savingTemplate={templateMutation.isPending}
                onBack={() => setSelectedRecordId(null)}
                onModeChange={setMode}
                onRetry={() => { setSaveStatus("dirty"); setSaveAttempt((attempt) => attempt + 1); }}
                onSaveTemplate={() => templateMutation.mutate(selectedRecord)}
                onDelete={() => setPendingDelete(selectedRecord)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8">
                <article className="mx-auto max-w-[65ch]">
                  <h1 className="font-ui text-[var(--t-title)] font-semibold text-[var(--text)]">{selectedTitle}</h1>
                  <DocumentProvenance record={selectedRecord} />
                <QueryState
                  isLoading={vaultFileQuery.isLoading}
                  error={vaultFileQuery.error}
                  isEmpty={false}
                  errorTitle="Document couldn’t be opened"
                  loadingLabel="Opening document"
                  loadingFallback={<EditorFallback />}
                  onRetry={() => void vaultFileQuery.refetch()}
                >
                  <ProposalStrip
                    docPath={selectedVaultPath || null}
                    onApplied={(text) => {
                      const editable = documentEditableBody(text);
                      setContent(editable);
                      setSaveStatus(editable === persistedContent ? "idle" : "dirty");
                    }}
                  />
                  <GraphEmbeds markdown={content} />
                  {mode === "edit" ? (
                    <Suspense fallback={<EditorFallback />}>
                      <InlineMarkdownEditor
                        key={`${selectedRecordId}:${vaultFileQuery.dataUpdatedAt}`}
                        initialValue={content}
                        onChange={(value) => {
                          setContent(value);
                          setSaveStatus(value === persistedContent ? "idle" : "dirty");
                        }}
                      />
                    </Suspense>
                  ) : <MarkdownBody content={content} />}
                </QueryState>
                </article>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-label">{allRecords.length === 0 ? "No documents" : "Select a document"}</p>
              <p className="max-w-[440px] text-ui text-[var(--subtext-0)]">
                This is the writing room for every markdown document tracked by the Supabase Documents database.
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

function DocumentProvenance({ record }: { record: WorkspaceDatabaseRecordModel }) {
  const author = documentFieldString(record, DOCUMENTS_DB_FIELDS.author);
  const attachment = documentAttachmentLabel(record);
  const updated = formatDocumentDate(
    documentFieldString(record, DOCUMENTS_DB_FIELDS.updatedAt) || String(record._updatedAt ?? ""),
  );
  const parts = [
    author ? (/^(adam|you)$/i.test(author) ? "You wrote it" : `${author} wrote it`) : "",
    updated ? `Updated ${updated}` : "",
    attachment ? `linked to ${attachment}` : "",
  ].filter(Boolean);
  return <p className="mb-7 mt-1 text-[var(--t-meta)] text-[var(--text-muted)]" title={parts.join(" · ")}>{parts.join(" · ")}</p>;
}
