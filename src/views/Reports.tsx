import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QueryState } from "@/components/ui/query-state";
import { Select } from "@/components/ui/select";
import {
  createWorkspaceRecord,
  DOCUMENT_STAGE_OPTIONS,
  DOCUMENTS_DB_FIELDS,
  getDocumentsWorkspaceBundle,
  getVaultFile,
  listAllVaultFiles,
  syncVaultFilesToDocumentRecords,
  updateVaultFileContent,
  updateWorkspaceRecord,
} from "@/lib/data";
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

function fieldString(record: WorkspaceDatabaseRecordModel | null, fieldId: string) {
  const value = record?.[fieldId];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function slugForTitle(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `document-${Date.now()}`;
}

function normalizeModelRecord(record: WorkspaceDatabaseRecord): WorkspaceDatabaseRecordModel {
  return {
    id: record.id,
    _body: record.body ?? undefined,
    _createdAt: record.created_at,
    _updatedAt: record.updated_at,
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

export function ReportsView() {
  const queryClient = useQueryClient();
  const { isCramped } = useWindowSize();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [persistedContent, setPersistedContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const latestContentRef = useRef("");

  const docsQuery = useQuery({
    queryKey: ["docs-workspace-bundle", entityFilter],
    queryFn: async () => {
      await syncVaultFilesToDocumentRecords();
      return getDocumentsWorkspaceBundle();
    },
  });

  const bundle = docsQuery.data ?? null;
  const records = useMemo(
    () =>
      (bundle?.records ?? [])
        .filter((record) => !entityFilter || record.entity === entityFilter || record.fields[DOCUMENTS_DB_FIELDS.entity] === entityFilter)
        .map(normalizeModelRecord)
        .filter((record) => stageFilter === "all" || fieldString(record, DOCUMENTS_DB_FIELDS.stage) === stageFilter)
        .sort((a, b) => String(b[DOCUMENTS_DB_FIELDS.updatedAt] ?? b._updatedAt ?? "").localeCompare(String(a[DOCUMENTS_DB_FIELDS.updatedAt] ?? a._updatedAt ?? ""))),
    [bundle?.records, entityFilter, stageFilter],
  );

  useEffect(() => {
    if (selectedRecordId && records.some((record) => record.id === selectedRecordId)) return;
    if (isCramped) {
      if (selectedRecordId) setSelectedRecordId(null);
      return;
    }
    setSelectedRecordId(records[0]?.id ?? null);
  }, [records, selectedRecordId, isCramped]);

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) ?? null,
    [records, selectedRecordId],
  );
  const selectedVaultPath = fieldString(selectedRecord, DOCUMENTS_DB_FIELDS.vaultPath);
  const selectedTitle = fieldString(selectedRecord, DOCUMENTS_DB_FIELDS.title) || "Untitled document";

  const vaultFileQuery = useQuery({
    queryKey: ["docs-vault-content", selectedRecordId, selectedVaultPath],
    queryFn: async () => {
      if (!selectedRecord) return "";
      if (selectedVaultPath) {
        try {
          const matchedFile = await getVaultFileByPath(selectedVaultPath);
          if (matchedFile) {
            const file = await getVaultFile(matchedFile.id);
            return file.content ?? "";
          }
        } catch {
          // Fall through to the Tauri vault read for local-only docs.
        }
        return readVaultFile(selectedVaultPath);
      }
      return String(selectedRecord._body ?? "");
    },
    enabled: !!selectedRecord,
  });

  useEffect(() => {
    const nextContent = vaultFileQuery.data ?? "";
    if (vaultFileQuery.data === undefined) return;
    latestContentRef.current = nextContent;
    setContent(nextContent);
    setPersistedContent(nextContent);
    setSaveStatus("idle");
  }, [selectedRecordId, vaultFileQuery.data]);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  const stageMutation = useMutation({
    mutationFn: ({ recordId, stage }: { recordId: string; stage: string }) =>
      updateWorkspaceRecord(recordId, {
        fieldId: DOCUMENTS_DB_FIELDS.stage,
        value: stage,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      toast.success("Document stage updated");
    },
    onError: (error) => toastError("Couldn't update stage", error),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!bundle?.database.id) throw new Error("Documents database is not ready.");
      const title = "Untitled document";
      const path = `documents/${slugForTitle(title)}-${Date.now()}.md`;
      await writeVaultFile(path, `# ${title}\n`);
      try {
        return await createWorkspaceRecord({
          databaseId: bundle.database.id,
          fields: {
            [DOCUMENTS_DB_FIELDS.title]: title,
            [DOCUMENTS_DB_FIELDS.docType]: "note",
            [DOCUMENTS_DB_FIELDS.stage]: "Draft",
            [DOCUMENTS_DB_FIELDS.entity]: entityFilter ?? "genzen",
            [DOCUMENTS_DB_FIELDS.vaultPath]: path,
            [DOCUMENTS_DB_FIELDS.linkedCase]: null,
            [DOCUMENTS_DB_FIELDS.linkedEngagement]: null,
            [DOCUMENTS_DB_FIELDS.createdAt]: new Date().toISOString(),
            [DOCUMENTS_DB_FIELDS.updatedAt]: new Date().toISOString(),
          },
          taxonomy: {
            entity: entityFilter ?? "genzen",
            area: "internal_ops",
            folder: "Documents",
            object_type: "document",
            routing_rule: "documents_database",
          },
        });
      } catch (error) {
        try {
          await removeVaultFile(path);
        } catch (cleanupError) {
          console.error("Failed to remove orphaned document after record creation failed:", cleanupError);
          const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          const creationMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Document record creation failed (${creationMessage}), and the new vault file could not be removed: ${cleanupMessage}`);
        }
        throw error;
      }
    },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      setSelectedRecordId(record.id);
      toast.success("Document created");
    },
    onError: (error) => toastError("Couldn't create document", error),
  });

  useEffect(() => {
    if (!selectedRecord || content === persistedContent || saveStatus !== "dirty") return;
    const recordId = selectedRecord.id;
    const vaultPath = selectedVaultPath;
    const nextContent = content;
    const timer = window.setTimeout(async () => {
      try {
        setSaveStatus("saving");
        const matchedFile = vaultPath ? await getVaultFileByPath(vaultPath) : null;
        if (matchedFile) {
          await updateVaultFileContent(matchedFile.id, nextContent);
        } else if (vaultPath) {
          await writeVaultFile(vaultPath, nextContent);
        } else {
          await updateWorkspaceRecord(recordId, { body: nextContent });
        }
        await updateWorkspaceRecord(recordId, {
          fieldId: DOCUMENTS_DB_FIELDS.updatedAt,
          value: new Date().toISOString(),
        });
        setPersistedContent(nextContent);
        setSaveStatus(latestContentRef.current !== nextContent ? "dirty" : "saved");
        await queryClient.invalidateQueries({ queryKey: ["docs-workspace-bundle"] });
      } catch (error) {
        setSaveStatus("error");
        toastError("Couldn't save document", error);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [content, persistedContent, queryClient, saveStatus, selectedRecord, selectedVaultPath]);

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
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <header
        className={cn(
          "shrink-0 border-b border-[var(--border)]",
          isCramped
            ? "flex flex-col items-stretch gap-3 px-4 py-3"
            : "flex h-14 items-center justify-between px-5",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-4 w-4 text-[var(--accent)]" />
          <div className="min-w-0">
            <span className="text-label">Docs</span>
            <p className="truncate text-meta">
              {records.length} document{records.length === 1 ? "" : "s"} · markdown, edits save in place
            </p>
          </div>
        </div>
        <div className={cn("flex items-center gap-2", isCramped ? "w-full" : undefined)}>
          <Select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
            controlSize="sm"
            containerClassName={isCramped ? "min-w-0 flex-1" : undefined}
            aria-label="Filter by stage"
          >
            <option value="all">All stages</option>
            {DOCUMENT_STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </Select>
          <Button size="sm" className="gap-1.5" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            <Plus className="h-3 w-3" />
            New doc
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "flex flex-col overflow-hidden",
            isCramped
              ? selectedRecordId
                ? "hidden"
                : "w-full"
              : "w-[420px] shrink-0 border-r border-[var(--border)]",
          )}
        >
          <DocsTable records={records} selectedRecordId={selectedRecordId} onSelect={setSelectedRecordId} onStage={(recordId, stage) => stageMutation.mutate({ recordId, stage })} />
        </aside>

        <section
          className={cn(
            "min-w-0 flex-1 flex-col overflow-hidden",
            isCramped && !selectedRecordId ? "hidden" : "flex",
          )}
        >
          {selectedRecord ? (
            <>
              <div className="shrink-0 border-b border-[var(--border)] px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  {isCramped ? (
                    <button
                      type="button"
                      onClick={() => setSelectedRecordId(null)}
                      aria-label="Back to document list"
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--subtext-0)] transition-colors hover:text-[var(--text)]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <div className="min-w-0">
                    <h1 className="truncate font-ui text-[17px] font-semibold text-[var(--text)]">{selectedTitle}</h1>
                    <p className="mt-1 truncate text-meta">
                      {fieldString(selectedRecord, DOCUMENTS_DB_FIELDS.docType) || "note"} · {fieldString(selectedRecord, DOCUMENTS_DB_FIELDS.vaultPath) || "workspace body"}
                    </p>
                  </div>
                  <span className={cn(
                    "font-mono text-[10px]",
                    saveStatus === "error" ? "text-[var(--danger)]" : saveStatus === "saved" ? "text-[var(--success)]" : "text-[var(--overlay-1)]",
                  )}>
                    {saveStatus === "dirty" ? "Editing..." : saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : ""}
                  </span>
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
                Docs is the editing surface for every piece of business paper — workflow reports,
                briefs, contracts, invoices. Investigation outputs land here automatically; pick one
                to edit its markdown in place, then move it through the stages.
              </p>
              <p className="max-w-[440px] font-mono text-[10px] text-[var(--overlay-1)]">
                Draft → Copy-audit → Approved → Published/Sent (that last one is yours alone)
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const DOC_TYPE_ORDER = ["report", "brief", "contract", "invoice", "one-pager", "note"] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
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
  onStage,
}: {
  records: WorkspaceDatabaseRecordModel[];
  selectedRecordId: string | null;
  onSelect: (recordId: string) => void;
  onStage: (recordId: string, stage: string) => void;
}) {
  const groups = DOC_TYPE_ORDER
    .map((type) => ({
      type,
      label: DOC_TYPE_LABELS[type],
      items: records.filter((record) => (fieldString(record, DOCUMENTS_DB_FIELDS.docType) || "note") === type),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.type}>
          <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--base)] px-4 py-2">
            <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--overlay-1)]">
              {group.label}
            </span>
            <span className="rounded-full border border-[var(--border)] px-1.5 font-mono text-[10px] text-[var(--overlay-1)]">
              {group.items.length}
            </span>
          </header>
          <DocsRows records={group.items} selectedRecordId={selectedRecordId} onSelect={onSelect} onStage={onStage} />
        </section>
      ))}
    </div>
  );
}

function DocsRows({
  records,
  selectedRecordId,
  onSelect,
  onStage,
}: {
  records: WorkspaceDatabaseRecordModel[];
  selectedRecordId: string | null;
  onSelect: (recordId: string) => void;
  onStage: (recordId: string, stage: string) => void;
}) {
  return (
    <>
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          onClick={() => onSelect(record.id)}
          className={cn(
            "grid w-full grid-cols-[1fr_auto] gap-2 border-b border-[var(--border-subtle)] px-4 py-3 text-left",
            selectedRecordId === record.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-wash)]",
          )}
        >
          <span className="min-w-0">
            <span className="block truncate font-ui text-[13px] font-medium text-[var(--text)]">
              {fieldString(record, DOCUMENTS_DB_FIELDS.title) || "Untitled"}
            </span>
            <span className="mt-1 block truncate text-meta">
              {fieldString(record, DOCUMENTS_DB_FIELDS.linkedCase) || taxonomyEntityLabel({ entity: fieldString(record, DOCUMENTS_DB_FIELDS.entity) })}
            </span>
          </span>
          <StageSelect record={record} onStage={onStage} />
        </button>
      ))}
    </>
  );
}

const STAGE_TONE: Record<string, string> = {
  Draft: "var(--accent)",
  "Copy-audit": "var(--caution)",
  Approved: "var(--success)",
  "Published/Sent": "var(--overlay-1)",
};

/** Compact stage pill: colored dot + label, with an invisible native select
 * on top so one click still opens the stage menu. */
function StageSelect({
  record,
  onStage,
}: {
  record: WorkspaceDatabaseRecordModel;
  onStage: (recordId: string, stage: string) => void;
}) {
  const stage = fieldString(record, DOCUMENTS_DB_FIELDS.stage) || "Draft";
  return (
    <span className="relative inline-flex shrink-0 items-center gap-1.5 self-center rounded-full border border-[var(--border)] px-2 py-0.5 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_1px_var(--accent-border)]">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: STAGE_TONE[stage] ?? "var(--overlay-1)" }}
      />
      <span className="font-ui text-[10px] font-medium text-[var(--subtext-0)]">{stage}</span>
      <Select
        value={stage}
        aria-label="Document stage"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onStage(record.id, event.target.value)}
        hideChevron
        containerClassName="absolute inset-0"
        className="h-full w-full cursor-pointer opacity-0"
      >
        {DOCUMENT_STAGE_OPTIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </Select>
    </span>
  );
}

async function getVaultFileByPath(path: string) {
  const files = await listAllVaultFiles();
  return files.find((file) => file.file_path === path) ?? null;
}
