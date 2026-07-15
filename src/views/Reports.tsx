import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  CopyPlus,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { CollapsedRailTrigger } from "@/components/layout/collapsed-rail-trigger";
import { CollapsibleRail } from "@/components/layout/collapsible-rail";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { QueryState } from "@/components/ui/query-state";
import { Select } from "@/components/ui/select";
import { VentureScope } from "@/components/ui/venture-scope";
import {
  createRecordFromTemplate,
  deleteVaultFile,
  deleteWorkspaceRecord,
  DOCUMENTS_DB_FIELDS,
  DOCUMENT_TYPE_OPTIONS,
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
  documentFieldString,
  documentFreshness,
  documentMatchesSearch,
  documentSourceLabel,
  isAbsoluteDocumentPath,
  quickNoteTitle,
  safeDocumentFolder,
  slugForDocumentTitle,
  upsertDocumentFrontmatterId,
} from "@/lib/documents";
import { taxonomyEntityLabel } from "@/lib/taxonomy";
import { toast, toastError } from "@/lib/toast";
import type {
  WorkspaceDatabaseRecord,
  WorkspaceDatabaseRecordModel,
} from "@/lib/types";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { readVaultFile, removeVaultFile, writeVaultFile } from "@/lib/vault";
import { useAppStore } from "@/store";

const InlineMarkdownEditor = lazy(async () => {
  const module = await import("@/components/reports/inline-markdown-editor");
  return { default: module.InlineMarkdownEditor };
});

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
const DOCS_RAIL_STORAGE_KEY = "intelizen:docs-rail-collapsed";

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
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-wash)]">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
    </div>
  );
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
  const vaultPath = documentFieldString(record, DOCUMENTS_DB_FIELDS.vaultPath);
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
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(() => {
    const requested = searchParams.get("type");
    return requested && DOCUMENT_TYPE_OPTIONS.includes(requested as (typeof DOCUMENT_TYPE_OPTIONS)[number])
      ? requested
      : "all";
  });
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(() => searchParams.get("record"));
  const [pendingDelete, setPendingDelete] = useState<WorkspaceDatabaseRecordModel | null>(null);
  const [content, setContent] = useState("");
  const [persistedContent, setPersistedContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(DOCS_RAIL_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [saveAttempt, setSaveAttempt] = useState(0);
  const latestContentRef = useRef("");

  const docsQuery = useQuery({
    queryKey: ["docs-workspace-bundle", entityFilter],
    queryFn: async () => {
      await syncVaultFilesToDocumentRecords();
      return getDocumentsWorkspaceBundle();
    },
  });

  const bundle = docsQuery.data ?? null;
  const allRecords = useMemo(
    () =>
      (bundle?.records ?? [])
        .filter((record) =>
          !entityFilter ||
          record.entity === entityFilter ||
          record.fields[DOCUMENTS_DB_FIELDS.entity] === entityFilter
        )
        .map(normalizeModelRecord)
        .sort((a, b) =>
          String(b[DOCUMENTS_DB_FIELDS.updatedAt] ?? b._updatedAt ?? "")
            .localeCompare(String(a[DOCUMENTS_DB_FIELDS.updatedAt] ?? a._updatedAt ?? ""))
        ),
    [bundle?.records, entityFilter],
  );
  const records = useMemo(
    () => allRecords.filter((record) =>
      documentMatchesSearch(record, searchQuery) &&
      (typeFilter === "all" || documentFieldString(record, DOCUMENTS_DB_FIELDS.docType) === typeFilter)
    ),
    [allRecords, searchQuery, typeFilter],
  );
  const templates = useMemo(() => allRecords.filter((record) => record._isTemplate), [allRecords]);

  useEffect(() => {
    if (selectedRecordId && records.some((record) => record.id === selectedRecordId)) return;
    if (isCramped) {
      if (selectedRecordId) setSelectedRecordId(null);
      return;
    }
    setSelectedRecordId(records[0]?.id ?? null);
  }, [records, selectedRecordId, isCramped]);

  const selectedRecord = useMemo(
    () => allRecords.find((record) => record.id === selectedRecordId) ?? null,
    [allRecords, selectedRecordId],
  );
  const selectedVaultPath = documentFieldString(selectedRecord, DOCUMENTS_DB_FIELDS.vaultPath);
  const selectedTitle = selectedRecord ? documentDisplayTitle(selectedRecord) : "Untitled document";

  const vaultFileQuery = useQuery({
    queryKey: ["docs-vault-content", selectedRecordId, selectedVaultPath],
    queryFn: () => selectedRecord ? readDocumentContent(selectedRecord) : Promise.resolve(""),
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
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOCS_RAIL_STORAGE_KEY, railCollapsed ? "1" : "0");
    } catch {
      /* keep the mounted preference */
    }
  }, [railCollapsed]);

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
    onSuccess: async ({ record, warning }) => {
      await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      setSelectedRecordId(record.id);
      setShowCreateMenu(false);
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
        setContent(nextContent);
        setPersistedContent(nextContent);
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

  const realDocumentCount = allRecords.filter((record) => !record._isTemplate).length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <header className={cn(
        "shrink-0 border-b border-[var(--border)]",
        isCramped ? "flex flex-col items-stretch gap-3 px-4 py-3" : "flex h-14 items-center justify-between px-5",
      )}>
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-4 w-4 text-[var(--accent)]" />
          <div className="min-w-0">
            <span className="text-label">Docs</span>
            <p className="truncate text-meta">
              {realDocumentCount} document{realDocumentCount === 1 ? "" : "s"} · Supabase rows linked to portable markdown
            </p>
          </div>
        </div>
        <div className={cn("flex items-center gap-2", isCramped ? "w-full" : undefined)}>
          <VentureScope className={isCramped ? "hidden sm:inline-flex" : undefined} />
          <div className={cn("relative", isCramped ? "min-w-0 flex-1" : "w-64")}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--overlay-1)]" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search documents"
              aria-label="Search documents"
              className="h-8 pl-8"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(event) => {
              const nextType = event.target.value;
              setTypeFilter(nextType);
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                if (nextType === "all") next.delete("type");
                else next.set("type", nextType);
                next.delete("record");
                return next;
              }, { replace: true });
            }}
            controlSize="sm"
            aria-label="Filter documents by type"
            containerClassName="w-36 shrink-0"
          >
            <option value="all">All types</option>
            {DOCUMENT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{DOC_TYPE_LABELS[type] ?? type}</option>
            ))}
          </Select>
          <div className="relative">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setShowCreateMenu((open) => !open)}
              disabled={createMutation.isPending}
              aria-expanded={showCreateMenu}
            >
              <Plus className="h-3 w-3" />
              New
              <ChevronDown className="h-3 w-3" />
            </Button>
            {showCreateMenu ? (
              <div className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-2 shadow-[var(--shadow-elevated)]">
                <p className="px-2 pb-1 pt-1 text-label">From a template</p>
                {templates.length > 0 ? templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-ui text-[12px] text-[var(--text)] hover:bg-[var(--surface-wash)]"
                    onClick={() => createMutation.mutate(template)}
                  >
                    <CopyPlus className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span className="truncate">{documentDisplayTitle(template)}</span>
                  </button>
                )) : (
                  <p className="px-2 py-2 text-meta">No document templates yet.</p>
                )}
                <div className="my-1 border-t border-[var(--border-subtle)]" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-ui text-[12px] text-[var(--text)] hover:bg-[var(--surface-wash)]"
                  onClick={() => createMutation.mutate(null)}
                >
                  <FileText className="h-3.5 w-3.5 text-[var(--subtext-0)]" />
                  Quick note
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <CollapsibleRail
          title="Documents"
          width={isCramped ? "100%" : 420}
          collapsed={!isCramped && railCollapsed}
          onCollapse={() => setRailCollapsed(true)}
          collapseLabel="Collapse document list"
          showCollapseButton={!isCramped}
          className={cn(isCramped && selectedRecordId && "hidden")}
        >
          <DocsTable records={records} selectedRecordId={selectedRecordId} onSelect={setSelectedRecordId} searchQuery={searchQuery} />
        </CollapsibleRail>

        <section className={cn(
          "relative min-w-0 flex-1 flex-col overflow-hidden transition-[padding] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isCramped && !selectedRecordId ? "hidden" : "flex",
          !isCramped && railCollapsed && "pl-14",
        )}>
          <CollapsedRailTrigger
            visible={!isCramped && railCollapsed}
            onExpand={() => setRailCollapsed(false)}
            label="Expand document list"
          />
          {selectedRecord ? (
            <>
              <div className="shrink-0 border-b border-[var(--border)] px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  {isCramped ? (
                    <button
                      type="button"
                      onClick={() => setSelectedRecordId(null)}
                      aria-label="Back to document list"
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--subtext-0)] transition-colors hover:text-[var(--text)]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h1 className="truncate font-ui text-[17px] font-semibold text-[var(--text)]">{selectedTitle}</h1>
                      {selectedRecord._isTemplate ? <span className="shrink-0 text-label">Template</span> : null}
                    </div>
                    <DocumentProvenance record={selectedRecord} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {saveStatus === "error" ? (
                      <Button size="sm" variant="secondary" onClick={() => {
                        setSaveStatus("dirty");
                        setSaveAttempt((attempt) => attempt + 1);
                      }}>
                        Retry save
                      </Button>
                    ) : (
                      <span className={cn(
                        "px-2 font-mono text-[10px]",
                        saveStatus === "saved" ? "text-[var(--success)]" : "text-[var(--overlay-1)]",
                      )}>
                        {saveStatus === "dirty" ? "Editing…" : saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}
                      </span>
                    )}
                    {!selectedRecord._isTemplate ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => templateMutation.mutate(selectedRecord)}
                        disabled={templateMutation.isPending}
                        title="Save this document as a reusable template"
                      >
                        <CopyPlus className="h-3.5 w-3.5" />
                        {!isCramped ? "Save template" : null}
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPendingDelete(selectedRecord)}
                      aria-label="Delete document"
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <QueryState
                  isLoading={vaultFileQuery.isLoading}
                  error={vaultFileQuery.error}
                  isEmpty={false}
                  errorTitle="Document couldn’t be opened"
                  loadingLabel="Opening document"
                  loadingFallback={<EditorFallback />}
                  onRetry={() => void vaultFileQuery.refetch()}
                >
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
                </QueryState>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-label">{records.length === 0 ? "No documents" : "Select a document"}</p>
              <p className="max-w-[440px] text-ui text-[var(--subtext-0)]">
                This is the writing room for every markdown document tracked by the Supabase Documents database.
                Choose a document, create one from a template, or capture a quick note.
              </p>
            </div>
          )}
        </section>
      </div>

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
  const entity = documentFieldString(record, DOCUMENTS_DB_FIELDS.entity);
  const attachment = documentAttachmentLabel(record);
  const updated = formatDocumentDate(
    documentFieldString(record, DOCUMENTS_DB_FIELDS.updatedAt) || String(record._updatedAt ?? ""),
  );
  const parts = [
    taxonomyEntityLabel({ entity }),
    documentSourceLabel(record),
    author ? `By ${author}` : "",
    updated ? `Updated ${updated}` : "",
    attachment ? `Attached to ${attachment}` : "",
  ].filter(Boolean);
  return <p className="mt-1 truncate text-meta" title={parts.join(" · ")}>{parts.join(" · ")}</p>;
}

const DOC_TYPE_ORDER = ["daily-brief", "report", "brief", "contract", "invoice", "one-pager", "note"] as const;
const DOC_TYPE_LABELS: Record<string, string> = {
  "daily-brief": "Daily briefs",
  report: "Reports",
  brief: "Briefs",
  contract: "Contracts",
  invoice: "Invoices",
  "one-pager": "One-pagers",
  note: "Notes",
};

function DocsTable({
  records,
  selectedRecordId,
  onSelect,
  searchQuery,
}: {
  records: WorkspaceDatabaseRecordModel[];
  selectedRecordId: string | null;
  onSelect: (recordId: string) => void;
  searchQuery: string;
}) {
  const groups = [
    {
      type: "template",
      label: "Templates",
      items: records.filter((record) => record._isTemplate),
    },
    ...DOC_TYPE_ORDER.map((type) => ({
      type,
      label: DOC_TYPE_LABELS[type],
      items: records.filter((record) =>
        !record._isTemplate && (documentFieldString(record, DOCUMENTS_DB_FIELDS.docType) || "note") === type
      ),
    })),
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-label">{searchQuery ? "No matching documents" : "No documents yet"}</p>
        <p className="mt-1 text-meta">{searchQuery ? "Try a title, author, venture, case, or filename." : "Use New to capture a note."}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.type}>
          <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--base)] px-4 py-2">
            <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">{group.label}</span>
            <span className="rounded-full border border-[var(--border)] px-1.5 font-mono text-[10px] text-[var(--overlay-1)]">{group.items.length}</span>
          </header>
          {group.items.map((record) => (
            <DocumentRow key={record.id} record={record} selected={selectedRecordId === record.id} onSelect={onSelect} />
          ))}
        </section>
      ))}
    </div>
  );
}

function DocumentRow({
  record,
  selected,
  onSelect,
}: {
  record: WorkspaceDatabaseRecordModel;
  selected: boolean;
  onSelect: (recordId: string) => void;
}) {
  const freshness = documentFreshness(record);
  const stage = documentFieldString(record, DOCUMENTS_DB_FIELDS.stage) || "Draft";
  const author = documentFieldString(record, DOCUMENTS_DB_FIELDS.author);
  const entity = documentFieldString(record, DOCUMENTS_DB_FIELDS.entity);
  const attachment = documentAttachmentLabel(record);
  const updated = formatDocumentDate(
    documentFieldString(record, DOCUMENTS_DB_FIELDS.updatedAt) || String(record._updatedAt ?? ""),
  );
  return (
    <button
      type="button"
      onClick={() => onSelect(record.id)}
      className={cn(
        "grid w-full grid-cols-[1fr_auto] gap-3 border-b border-[var(--border-subtle)] px-4 py-3 text-left transition-colors",
        selected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-wash)]",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-ui text-[13px] font-medium text-[var(--text)]">{documentDisplayTitle(record)}</span>
        <span className="mt-1 block truncate text-meta">
          {author ? `${author} · ` : ""}{attachment || taxonomyEntityLabel({ entity })}{updated ? ` · ${updated}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 self-center">
        {freshness ? (
          <span className={cn(
            "rounded-full px-2 py-0.5 font-ui text-[10px] font-medium",
            freshness === "new" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-wash)] text-[var(--subtext-0)]",
          )}>
            {freshness === "new" ? "New" : "Changed"}
          </span>
        ) : null}
        {stage !== "Draft" ? <span className="text-label">{stage}</span> : null}
      </span>
    </button>
  );
}
