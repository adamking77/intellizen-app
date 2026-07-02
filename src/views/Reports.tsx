import { lazy, Suspense, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  History,
  FileText,
  FolderOpen,
  FolderPlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ContextMenu } from "@/components/ui/context-menu";
import { MarkdownBody } from "@/components/ui/markdown-body";
import {
  createWorkspaceFolder,
  createVaultDocument,
  deleteVaultDocument,
  deleteVaultFile,
  ensureWorkspaceSystemNodes,
  getWorkspaceNode,
  getVaultDocument,
  getVaultFile,
  listAgentProjects,
  listAgentWork,
  listAllVaultFiles,
  listInvestigations,
  listProjects,
  listVaultDocuments,
  listWorkflowRuns,
  listWorkflows,
  listWorkspaceNodes,
  updateWorkspaceFileContent,
  updateVaultDocumentContent,
  updateVaultFileContent,
} from "@/lib/data";
import {
  buildReceiptReflectionDigest,
  buildWeeklyOperatingBrief,
  type ReceiptReflectionDigest,
  type WeeklyOperatingBrief,
} from "@/lib/operating-views";
import type { Investigation, Project, VaultDocument, VaultFile, WorkspaceNodeSummary } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useWindowSize } from "@/lib/use-window-size";

type Selection =
  | { kind: "doc"; id: number }
  | { kind: "file"; id: number }
  | { kind: "workspace-file"; id: number }
  | { kind: "project"; id: number }
  | { kind: "investigation"; caseId: string }
  | null;

type ReportSaveStatus = "idle" | "dirty" | "saving" | "error";
type OperatingReportMode = "weekly" | "reflection";

type PathTreeNode =
  | {
      kind: "folder";
      name: string;
      fullPath: string;
      children: PathTreeNode[];
      nodeId?: number;
      projectId?: number | null;
      caseId?: string | null;
    }
  | { kind: "doc"; name: string; fullPath: string; docId: number }
  | { kind: "file"; name: string; fullPath: string; fileId: number }
  | { kind: "workspace-file"; name: string; fullPath: string; nodeId: number };

const InlineMarkdownEditor = lazy(async () => {
  const module = await import("@/components/reports/inline-markdown-editor");
  return { default: module.InlineMarkdownEditor };
});

function EditorLoadingFallback() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-wash)]">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--subtext-0)]" />
    </div>
  );
}

export function ReportsView() {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection>(null);
  const [activeStrategyFolderPath, setActiveStrategyFolderPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [persistedContent, setPersistedContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<ReportSaveStatus>("idle");
  const [createMode, setCreateMode] = useState<"file" | "folder" | null>(null);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const [isSavingReflectionDigest, setIsSavingReflectionDigest] = useState(false);
  const [reportMode, setReportMode] = useState<OperatingReportMode>("weekly");
  // Operating reports are generated on explicit request, never as the
  // default landing surface (2026-07-02 surface governance).
  const [showOperatingReport, setShowOperatingReport] = useState(false);
  const { isCramped } = useWindowSize();
  const latestFileContentRef = useRef<string | null>(null);
  const hydratedSelectionKeyRef = useRef<string | null>(null);

  const [leftOpen, setLeftOpen] = useState(() => {
    try {
      return localStorage.getItem("intelizen:reports-left-open") !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("intelizen:reports-left-open", leftOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [leftOpen]);

  useEffect(() => {
    if (isCramped) setLeftOpen(false);
  }, [isCramped]);

  const { data: vaultDocs = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["vault-documents"],
    queryFn: listVaultDocuments,
  });
  const { data: workspaceNodes = [], isLoading: loadingWorkspace } = useQuery({
    queryKey: ["workspace-nodes"],
    queryFn: async () => {
      await ensureWorkspaceSystemNodes();
      return listWorkspaceNodes();
    },
  });
  const { data: vaultFiles = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["vault-files-all"],
    queryFn: listAllVaultFiles,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const { data: investigations = [] } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });
  const {
    data: operatingReports,
    isLoading: loadingOperatingReports,
    isFetching: fetchingOperatingReports,
    refetch: refetchOperatingReports,
  } = useQuery({
    queryKey: ["reports", "operating-reports"],
    queryFn: async () => {
      const [agentProjects, agentWork, workflows, workflowRuns] = await Promise.all([
        listAgentProjects({ includeDone: false, limit: 120 }),
        listAgentWork({ includeDone: false, limit: 220 }),
        listWorkflows({ includeInactive: false, limit: 120 }),
        listWorkflowRuns({ includeCompleted: false, limit: 120 }),
      ]);
      return {
        weeklyBrief: buildWeeklyOperatingBrief({
          projects: agentProjects,
          workItems: agentWork,
          workflows,
          workflowRuns,
        }),
        reflectionDigest: buildReceiptReflectionDigest({
          workItems: agentWork,
          workflowRuns,
        }),
      };
    },
    enabled: showOperatingReport,
  });
  const weeklyBrief = operatingReports?.weeklyBrief ?? null;
  const reflectionDigest = operatingReports?.reflectionDigest ?? null;
  const activeOperatingReport = reportMode === "weekly" ? weeklyBrief : reflectionDigest;
  const activeOperatingReportSaving = reportMode === "weekly" ? isSavingBrief : isSavingReflectionDigest;

  const isLoading = loadingDocs || loadingFiles || loadingWorkspace;

  const { data: selectedDoc, isLoading: loadingDoc } = useQuery({
    queryKey: ["vault-document", selection?.kind === "doc" ? selection.id : null],
    queryFn: () => getVaultDocument((selection as { kind: "doc"; id: number }).id),
    enabled: selection?.kind === "doc",
  });

  const { data: selectedFile, isLoading: loadingFile } = useQuery({
    queryKey: ["vault-file", selection?.kind === "file" ? selection.id : null],
    queryFn: () => getVaultFile((selection as { kind: "file"; id: number }).id),
    enabled: selection?.kind === "file",
  });
  const { data: selectedWorkspaceFile, isLoading: loadingWorkspaceFile } = useQuery({
    queryKey: ["workspace-file", selection?.kind === "workspace-file" ? selection.id : null],
    queryFn: () => getWorkspaceNode((selection as { kind: "workspace-file"; id: number }).id),
    enabled: selection?.kind === "workspace-file",
  });

  const fileTree = useMemo(
    () => buildSupabaseProjectTree(workspaceNodes, vaultDocs, vaultFiles),
    [vaultDocs, vaultFiles, workspaceNodes],
  );
  const selectedFileSummary = useMemo(
    () => (selection?.kind === "file" ? vaultFiles.find((item) => item.id === selection.id) ?? null : null),
    [selection, vaultFiles],
  );
  const selectedProject = useMemo(
    () => (selection?.kind === "project" ? projects.find((item) => item.id === selection.id) ?? null : null),
    [projects, selection],
  );
  const selectedInvestigation = useMemo(
    () =>
      selection?.kind === "investigation"
        ? investigations.find((item) => item.case_id === selection.caseId) ?? null
        : null,
    [investigations, selection],
  );

  const editableFileIds = useMemo(
    () => new Set(vaultFiles.filter((file) => isEditableVaultFile(file)).map((file) => file.id)),
    [vaultFiles],
  );
  const isFileEditable = selectedFileSummary ? editableFileIds.has(selectedFileSummary.id) : false;
  const activeEditorSelectionKey =
    selection?.kind === "doc"
      ? `doc:${selection.id}`
      : selection?.kind === "file"
        ? `file:${selection.id}`
        : selection?.kind === "workspace-file"
          ? `workspace-file:${selection.id}`
          : null;

  useEffect(() => {
    latestFileContentRef.current = fileContent;
  }, [fileContent]);

  useEffect(() => {
    if (!activeEditorSelectionKey) {
      hydratedSelectionKeyRef.current = null;
      setFileContent(null);
      setPersistedContent("");
      setSaveStatus("idle");
      return;
    }

    const normalized =
      selection?.kind === "doc"
        ? selectedDoc?.content
        : selection?.kind === "file"
          ? selectedFile?.content
          : selection?.kind === "workspace-file"
            ? selectedWorkspaceFile?.content
          : null;

    if (normalized === null || normalized === undefined) return;

    const isSelectionChange = hydratedSelectionKeyRef.current !== activeEditorSelectionKey;
    if (isSelectionChange) {
      hydratedSelectionKeyRef.current = activeEditorSelectionKey;
      setFileContent(normalized);
      setPersistedContent(normalized);
      setSaveStatus("idle");
      return;
    }

    const hasUnsavedLocalChanges = fileContent !== null && fileContent !== persistedContent;
    if (hasUnsavedLocalChanges) {
      return;
    }

    if (normalized !== persistedContent) {
      setFileContent(normalized);
      setPersistedContent(normalized);
      setSaveStatus("idle");
    }
  }, [activeEditorSelectionKey, fileContent, persistedContent, selectedDoc, selectedFile, selectedWorkspaceFile, selection]);

  useEffect(() => {
    if (fileContent === null || saveStatus !== "dirty" || fileContent === persistedContent) return;

    if (selection?.kind === "doc") {
      const valueToSave = fileContent;
      const timer = window.setTimeout(async () => {
        try {
          setSaveStatus("saving");
          const updated = await updateVaultDocumentContent(selection.id, valueToSave);
          queryClient.setQueryData(["vault-document", selection.id], updated);
          queryClient.setQueryData(["vault-documents"], (prev: VaultDocument[] | undefined) =>
            prev?.map((doc) => (doc.id === updated.id ? { ...doc, updated_at: updated.updated_at } : doc)) ?? prev,
          );
          setPersistedContent(valueToSave);
          setSaveStatus(latestFileContentRef.current !== valueToSave ? "dirty" : "idle");
        } catch {
          setSaveStatus("error");
        }
      }, 700);

      return () => window.clearTimeout(timer);
    }

    if (selection?.kind === "file" && isFileEditable) {
      const valueToSave = fileContent;
      const timer = window.setTimeout(async () => {
        try {
          setSaveStatus("saving");
          const updated = await updateVaultFileContent(selection.id, valueToSave);
          queryClient.setQueryData(["vault-file", selection.id], updated);
          queryClient.setQueryData(["vault-files-all"], (prev: VaultFile[] | undefined) =>
            prev?.map((file) => (file.id === updated.id ? updated : file)) ?? prev,
          );
          setPersistedContent(valueToSave);
          setSaveStatus(latestFileContentRef.current !== valueToSave ? "dirty" : "idle");
        } catch {
          setSaveStatus("error");
        }
      }, 700);

      return () => window.clearTimeout(timer);
    }

    if (selection?.kind === "workspace-file") {
      const valueToSave = fileContent;
      const timer = window.setTimeout(async () => {
        try {
          setSaveStatus("saving");
          const updated = await updateWorkspaceFileContent(selection.id, valueToSave);
          queryClient.setQueryData(["workspace-file", selection.id], updated);
          queryClient.setQueryData(["workspace-nodes"], (prev: WorkspaceNodeSummary[] | undefined) =>
            prev?.map((node) => (node.id === updated.id ? updated : node)) ?? prev,
          );
          setPersistedContent(valueToSave);
          setSaveStatus(latestFileContentRef.current !== valueToSave ? "dirty" : "idle");
        } catch {
          setSaveStatus("error");
        }
      }, 700);

      return () => window.clearTimeout(timer);
    }
  }, [fileContent, isFileEditable, persistedContent, queryClient, saveStatus, selection]);

  function handleEditorChange(nextValue: string) {
    setFileContent(nextValue);
    setSaveStatus(nextValue === persistedContent ? "idle" : "dirty");
  }

  async function handleDeleteFile(file: VaultFile, event: MouseEvent) {
    event.stopPropagation();
    try {
      await deleteVaultFile(file.id);
      if (selection?.kind === "file" && selection.id === file.id) setSelection(null);
      await queryClient.invalidateQueries({ queryKey: ["vault-files-all"] });
      toast.success("File deleted");
    } catch (error) {
      toastError("Delete failed", error instanceof Error ? error : new Error(String(error)));
    }
  }

  async function handleDeleteDoc(id: number) {
    try {
      await deleteVaultDocument(id);
      if (selection?.kind === "doc" && selection.id === id) setSelection(null);
      await queryClient.invalidateQueries({ queryKey: ["vault-documents"] });
      toast.success("Document deleted");
    } catch (error) {
      toastError("Delete failed", error instanceof Error ? error : new Error(String(error)));
    }
  }

  const breadcrumb =
    selection?.kind === "doc"
      ? selectedDoc?.source_path ?? null
      : selection?.kind === "file"
        ? selectedFileSummary?.file_path ?? null
        : selection?.kind === "workspace-file"
          ? selectedWorkspaceFile?.path ?? null
        : null;

  const showSaveStatus =
    selection?.kind === "doc" ||
    (selection?.kind === "file" && isFileEditable) ||
    selection?.kind === "workspace-file";
  const createTargetPath = activeStrategyFolderPath ?? (selection?.kind === "doc" ? dirname(selectedDoc?.source_path ?? null) : null);
  const createTargetLabel = createTargetPath ?? "GenZen OS";

  function beginCreate(mode: "file" | "folder") {
    setCreateMode(mode);
    setCreateName(mode === "file" ? "untitled.md" : "new-folder");
    setCreateError(null);
  }

  async function handleCreateStrategyEntry() {
    if (!createMode || isCreatingEntry) return;

    const rawName = createName.trim();
    const validationError = validateNewEntryName(rawName, createMode);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    try {
      setIsCreatingEntry(true);
      setCreateError(null);

      if (createMode === "folder") {
        const parentFolder = createTargetPath
          ? workspaceNodes.find((node) => node.kind === "folder" && node.path === createTargetPath)
          : null;
        const createdFolder = await createWorkspaceFolder({
          name: rawName,
          parentId: parentFolder?.id ?? null,
        });
        await queryClient.invalidateQueries({ queryKey: ["workspace-nodes"] });
        setActiveStrategyFolderPath(createdFolder.path);
      } else {
        const fileName = ensureMarkdownExtension(rawName);
        const sourcePath = createTargetPath ? `${createTargetPath}/${fileName}` : fileName;
        const createdDoc = await createVaultDocument({
          title: titleFromFileName(fileName),
          sourcePath,
          content: "",
        });

        await queryClient.invalidateQueries({ queryKey: ["vault-documents"] });
        queryClient.setQueryData(["vault-document", createdDoc.id], createdDoc);
        setSelection({ kind: "doc", id: createdDoc.id });
        setActiveStrategyFolderPath(dirname(createdDoc.source_path));
      }

      setCreateMode(null);
      setCreateName("");
    } catch (error) {
      setCreateError(getCreateErrorMessage(error, createMode));
    } finally {
      setIsCreatingEntry(false);
    }
  }

  async function handleSaveWeeklyBrief(brief: WeeklyOperatingBrief) {
    if (isSavingBrief) return;
    try {
      setIsSavingBrief(true);
      const existing = vaultDocs.find((doc) => doc.source_path === brief.sourcePath);
      if (existing) {
        const updated = await updateVaultDocumentContent(existing.id, brief.markdown);
        queryClient.setQueryData(["vault-document", existing.id], updated);
        await queryClient.invalidateQueries({ queryKey: ["vault-documents"] });
        setSelection({ kind: "doc", id: existing.id });
        toast.success("Operating brief updated");
        return;
      }

      const created = await createVaultDocument({
        title: brief.title,
        sourcePath: brief.sourcePath,
        content: brief.markdown,
        documentType: "operations",
        domain: "internal",
        metadata: {
          generated_at: brief.generatedAt,
          source: "intellizen_reports_weekly_operating_brief",
          object_type: "operating_brief",
          source_records: brief.sourceRecords,
          metrics: brief.metrics,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["vault-documents"] });
      queryClient.setQueryData(["vault-document", created.id], created);
      setSelection({ kind: "doc", id: created.id });
      toast.success("Operating brief saved");
    } catch (error) {
      toastError("Couldn't save operating brief", error);
    } finally {
      setIsSavingBrief(false);
    }
  }

  async function handleSaveReflectionDigest(digest: ReceiptReflectionDigest) {
    if (isSavingReflectionDigest) return;
    try {
      setIsSavingReflectionDigest(true);
      const existing = vaultDocs.find((doc) => doc.source_path === digest.sourcePath);
      if (existing) {
        const updated = await updateVaultDocumentContent(existing.id, digest.markdown);
        queryClient.setQueryData(["vault-document", existing.id], updated);
        await queryClient.invalidateQueries({ queryKey: ["vault-documents"] });
        setSelection({ kind: "doc", id: existing.id });
        toast.success("Reflection digest updated");
        return;
      }

      const created = await createVaultDocument({
        title: digest.title,
        sourcePath: digest.sourcePath,
        content: digest.markdown,
        documentType: "operations",
        domain: "internal",
        metadata: {
          generated_at: digest.generatedAt,
          source: "intellizen_reports_receipt_reflection_digest",
          object_type: "receipt_reflection_digest",
          source_records: digest.sourceRecords,
          metrics: digest.metrics,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["vault-documents"] });
      queryClient.setQueryData(["vault-document", created.id], created);
      setSelection({ kind: "doc", id: created.id });
      toast.success("Reflection digest saved");
    } catch (error) {
      toastError("Couldn't save reflection digest", error);
    } finally {
      setIsSavingReflectionDigest(false);
    }
  }

  function handleSaveOperatingReport(report: WeeklyOperatingBrief | ReceiptReflectionDigest) {
    if (reportMode === "weekly") {
      void handleSaveWeeklyBrief(report as WeeklyOperatingBrief);
      return;
    }
    void handleSaveReflectionDigest(report as ReceiptReflectionDigest);
  }

  return (
    <div className="relative flex h-[calc(100dvh)] w-full overflow-hidden bg-[var(--base)]">
      <aside
        style={{ width: leftOpen ? 300 : 0 }}
        className={cn(
          "relative flex h-full shrink-0 flex-col overflow-hidden bg-[var(--mantle)]",
          "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          leftOpen && "border-r border-[var(--border)]",
        )}
      >
        {leftOpen ? (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
              <span className="text-label">Reports</span>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                aria-label="Collapse reports sidebar"
                title="Collapse reports"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                </div>
              ) : (
                <>
                  <SectionHeader label="GenZen OS" count={countItems(fileTree)} />
                  <div className="mb-3 space-y-2 px-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => beginCreate("file")}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 text-[11px] text-[var(--subtext-1)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                      >
                        <Plus className="h-3 w-3" />
                        New File
                      </button>
                      <button
                        type="button"
                        onClick={() => beginCreate("folder")}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 text-[11px] text-[var(--subtext-1)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                      >
                        <FolderPlus className="h-3 w-3" />
                        New Folder
                      </button>
                    </div>
                    <p className="font-mono text-[10px] text-[var(--overlay-1)]">
                      Creating in: {createTargetLabel}
                    </p>
                    {createMode ? (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--base)] p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                          {createMode === "file" ? "New file" : "New folder"}
                        </p>
                        <input
                          value={createName}
                          autoFocus
                          onChange={(event) => setCreateName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleCreateStrategyEntry();
                            }
                            if (event.key === "Escape") {
                              setCreateMode(null);
                              setCreateName("");
                              setCreateError(null);
                            }
                          }}
                          placeholder={createMode === "file" ? "untitled.md" : "new-folder"}
                          className="mt-2 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 text-[12px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                        />
                        {createError ? (
                          <p className="mt-2 text-[11px] text-[var(--danger)]">{createError}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCreateMode(null);
                              setCreateName("");
                              setCreateError(null);
                            }}
                            className="text-[11px] text-[var(--overlay-1)] transition-colors hover:text-[var(--text)]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCreateStrategyEntry()}
                            disabled={!createName.trim() || isCreatingEntry}
                            className="inline-flex h-7 items-center rounded-md bg-[var(--accent)] px-2.5 text-[11px] font-medium text-[var(--crust)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isCreatingEntry ? "Creating…" : "Create"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {fileTree.length === 0 ? (
                    <EmptySection message="No Supabase workspace data found." />
                  ) : (
                    fileTree.map((node) => (
                      <PathNode
                        key={node.fullPath}
                        node={node}
                        selection={selection}
                        activeFolderPath={activeStrategyFolderPath}
                        projects={projects}
                        investigations={investigations}
                        onSelectDoc={(id) => setSelection({ kind: "doc", id })}
                        onSelectFile={(id) => setSelection({ kind: "file", id })}
                        onSelectWorkspaceFile={(id) => setSelection({ kind: "workspace-file", id })}
                        onSelectFolder={setActiveStrategyFolderPath}
                        onSelectProject={(id) => setSelection({ kind: "project", id })}
                        onSelectInvestigation={(caseId) => setSelection({ kind: "investigation", caseId })}
                        onDeleteDoc={handleDeleteDoc}
                        onDeleteFile={handleDeleteFile}
                        depth={0}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4">
          <div className={cn("flex min-w-0 items-center gap-3", !leftOpen && "pl-11")}>
            <span className="text-label">Reports</span>
            {breadcrumb && !isCramped ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--overlay-0)]" />
                <span className="truncate font-mono text-[11px] text-[var(--subtext-0)]">{breadcrumb}</span>
              </div>
            ) : null}
          </div>
          {showSaveStatus ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--overlay-1)]">
              {saveStatusLabel(saveStatus)}
            </span>
          ) : null}
        </div>

        {!leftOpen ? (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="absolute left-3 top-3 z-40 inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--base)] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            aria-label="Expand reports sidebar"
            title="Show reports"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {selection?.kind === "doc" && selectedDoc ? (
            <div className="px-[10%] py-10">
              <Suspense fallback={<EditorLoadingFallback />}>
                <InlineMarkdownEditor
                  key={`doc-${selection.id}`}
                  initialValue={fileContent ?? ""}
                  onChange={handleEditorChange}
                />
              </Suspense>
            </div>
          ) : selection?.kind === "doc" ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className={cn("h-4 w-4 text-[var(--subtext-0)]", loadingDoc && "animate-spin")} />
            </div>
          ) : selection?.kind === "file" && selectedFile ? (
            isFileEditable ? (
              <div className="px-[10%] py-10">
                <Suspense fallback={<EditorLoadingFallback />}>
                  <InlineMarkdownEditor
                    key={`file-${selection.id}`}
                    initialValue={fileContent ?? ""}
                    onChange={handleEditorChange}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="px-[10%] py-10">
                <p className="font-mono text-[11px] text-[var(--overlay-1)]">{selectedFile.file_path}</p>
                <div className="mt-4">
                  {selectedFile.content ? (
                    <MarkdownBody content={selectedFile.content} />
                  ) : (
                    <p className="text-[13px] text-[var(--subtext-0)]">No markdown content stored in Supabase for this file.</p>
                  )}
                </div>
              </div>
            )
          ) : selection?.kind === "file" ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className={cn("h-4 w-4 text-[var(--subtext-0)]", loadingFile && "animate-spin")} />
            </div>
          ) : selection?.kind === "workspace-file" && selectedWorkspaceFile ? (
            <div className="px-[10%] py-10">
              <Suspense fallback={<EditorLoadingFallback />}>
                <InlineMarkdownEditor
                  key={`workspace-file-${selection.id}`}
                  initialValue={fileContent ?? ""}
                  onChange={handleEditorChange}
                />
              </Suspense>
            </div>
          ) : selection?.kind === "workspace-file" ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className={cn("h-4 w-4 text-[var(--subtext-0)]", loadingWorkspaceFile && "animate-spin")} />
            </div>
          ) : selectedProject ? (
            <EntityDetail
              label="Project"
              name={selectedProject.name}
              meta={[
                { key: "Type", value: selectedProject.type },
                { key: "Status", value: selectedProject.status },
                { key: "Notes", value: selectedProject.notes ?? "—" },
                { key: "Created", value: fmtDate(selectedProject.created_at) },
              ]}
            />
          ) : selectedInvestigation ? (
            <EntityDetail
              label="Investigation"
              name={selectedInvestigation.name}
              meta={[
                { key: "Case ID", value: selectedInvestigation.case_id },
                { key: "Status", value: selectedInvestigation.status },
                { key: "Phase", value: String(selectedInvestigation.current_phase) },
                { key: "Subject", value: selectedInvestigation.subject_definition ?? "—" },
                { key: "Created", value: fmtDate(selectedInvestigation.created_at) },
              ]}
            />
          ) : showOperatingReport ? (
            <OperatingReportPanel
              report={activeOperatingReport}
              mode={reportMode}
              loading={loadingOperatingReports}
              fetching={fetchingOperatingReports}
              saving={activeOperatingReportSaving}
              onModeChange={setReportMode}
              onRefresh={() => void refetchOperatingReports()}
              onSave={handleSaveOperatingReport}
              onClose={() => setShowOperatingReport(false)}
            />
          ) : (
            <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <p className="font-ui text-[14px] font-medium text-[var(--subtext-0)]">No document selected</p>
              <p className="max-w-md font-ui text-[12px] leading-relaxed text-[var(--overlay-1)]">
                Pick a report or vault document from the sidebar, or generate an operating report from live state.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReportMode("weekly");
                    setShowOperatingReport(true);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 font-ui text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                >
                  Generate weekly brief
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReportMode("reflection");
                    setShowOperatingReport(true);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 font-ui text-[12px] font-medium text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                >
                  Generate reflection digest
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OperatingReportPanel({
  report,
  mode,
  loading,
  fetching,
  saving,
  onModeChange,
  onRefresh,
  onSave,
  onClose,
}: {
  report: WeeklyOperatingBrief | ReceiptReflectionDigest | null;
  mode: OperatingReportMode;
  loading: boolean;
  fetching: boolean;
  saving: boolean;
  onModeChange: (mode: OperatingReportMode) => void;
  onRefresh: () => void;
  onSave: (report: WeeklyOperatingBrief | ReceiptReflectionDigest) => void;
  onClose: () => void;
}) {
  const isWeekly = mode === "weekly";
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-5 py-6 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              {isWeekly ? "Weekly operating brief" : "Receipt reflection digest"}
            </p>
            <button
              type="button"
              onClick={onClose}
              title="Close report"
              className="inline-flex h-5 items-center rounded border border-[var(--border)] px-1.5 font-ui text-[10px] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            >
              Close
            </button>
          </div>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight text-[var(--text)]">
            {report?.title ?? (isWeekly ? "Weekly Operating Brief" : "Receipt Reflection Digest")}
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[var(--subtext-0)]">
            {isWeekly
              ? "Live workspace state, workflow runs, approval gates, blockers, receipts, and source records."
              : "Durable memory from current receipts, approval gates, blocker records, and follow-up signals."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex h-9 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--mantle)]">
            <button
              type="button"
              onClick={() => onModeChange("weekly")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 text-[12px] transition-colors",
                isWeekly ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--subtext-1)] hover:text-[var(--text)]",
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              Weekly
            </button>
            <button
              type="button"
              onClick={() => onModeChange("reflection")}
              className={cn(
                "inline-flex items-center gap-1.5 border-l border-[var(--border)] px-3 text-[12px] transition-colors",
                !isWeekly ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--subtext-1)] hover:text-[var(--text)]",
              )}
            >
              <History className="h-3.5 w-3.5" />
              Reflection
            </button>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={fetching}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 text-[12px] text-[var(--subtext-1)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => report && onSave(report)}
            disabled={!report || saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--crust)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </button>
          <Link
            to="/home"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 text-[12px] text-[var(--subtext-1)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            Home
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-wash)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
        </div>
      ) : report ? (
        <>
          <OperatingReportMetrics report={report} mode={mode} />

          <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-4">
            <div className="mb-4 flex flex-col gap-1 border-b border-[var(--border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Preview
              </span>
              <span className="font-mono text-[10px] text-[var(--overlay-1)]">{report.sourceRecords.length} source records</span>
            </div>
            <MarkdownBody content={report.markdown} />
          </div>
        </>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-4 py-10 text-center text-[13px] text-[var(--subtext-0)]">
          Operating report unavailable.
        </div>
      )}
    </div>
  );
}

function OperatingReportMetrics({
  report,
  mode,
}: {
  report: WeeklyOperatingBrief | ReceiptReflectionDigest;
  mode: OperatingReportMode;
}) {
  if (mode === "weekly") {
    const brief = report as WeeklyOperatingBrief;
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <BriefMetric label="Open work" value={brief.metrics.openWork} />
        <BriefMetric label="Approvals" value={brief.metrics.approvals} tone="warning" />
        <BriefMetric label="Blocked" value={brief.metrics.blocked} tone="danger" />
        <BriefMetric label="Runs" value={brief.metrics.activeRuns} tone="success" />
        <BriefMetric label="Workflows" value={brief.metrics.activeWorkflows} />
      </div>
    );
  }

  const digest = report as ReceiptReflectionDigest;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <BriefMetric label="Reviewed" value={digest.metrics.recordsReviewed} />
      <BriefMetric label="Receipts" value={digest.metrics.receipts} tone="success" />
      <BriefMetric label="Approvals" value={digest.metrics.approvals} tone="warning" />
      <BriefMetric label="Blocked" value={digest.metrics.blockers} tone="danger" />
      <BriefMetric label="Follow-ups" value={digest.metrics.followUps} />
    </div>
  );
}

function BriefMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-[var(--warning)]"
      : tone === "danger"
        ? "text-[var(--danger)]"
        : tone === "success"
          ? "text-[var(--success)]"
          : "text-[var(--text)]";
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className={cn("font-mono text-[22px] leading-none", toneClass)}>{value}</div>
      <div className="mt-1 font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
    </div>
  );
}

function PathNode({
  node,
  selection,
  activeFolderPath,
  projects,
  investigations,
  onSelectDoc,
  onSelectFile,
  onSelectWorkspaceFile,
  onSelectFolder,
  onSelectProject,
  onSelectInvestigation,
  onDeleteDoc,
  onDeleteFile,
  depth,
}: {
  node: PathTreeNode;
  selection: Selection;
  activeFolderPath: string | null;
  projects: Project[];
  investigations: Investigation[];
  onSelectDoc: (id: number) => void;
  onSelectFile: (id: number) => void;
  onSelectWorkspaceFile: (id: number) => void;
  onSelectFolder: (path: string) => void;
  onSelectProject: (id: number) => void;
  onSelectInvestigation: (caseId: string) => void;
  onDeleteDoc: (id: number) => void;
  onDeleteFile: (file: VaultFile, event: MouseEvent) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  if (node.kind !== "folder") {
    const isDoc = node.kind === "doc";
    const isVaultFile = node.kind === "file";
    const isSelected =
      (node.kind === "doc" && selection?.kind === "doc" && selection.id === node.docId) ||
      (node.kind === "file" && selection?.kind === "file" && selection.id === node.fileId) ||
      (node.kind === "workspace-file" && selection?.kind === "workspace-file" && selection.id === node.nodeId);

    return (
      <>
        <button
          type="button"
          onClick={() => {
            if (node.kind === "doc") onSelectDoc(node.docId);
            if (node.kind === "file") onSelectFile(node.fileId);
            if (node.kind === "workspace-file") onSelectWorkspaceFile(node.nodeId);
          }}
          onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className={cn(
            "relative flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left transition-colors",
            isSelected
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]",
          )}
        >
          {isSelected ? (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l bg-[var(--accent)]" />
          ) : null}
          <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1 truncate text-[12px]">{node.name}</span>
        </button>
        {ctx && isDoc && (
          <ContextMenu
            x={ctx.x}
            y={ctx.y}
            items={[{ label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, variant: "danger", onSelect: () => onDeleteDoc(node.docId) }]}
            onClose={() => setCtx(null)}
          />
        )}
        {ctx && isVaultFile && (
          <ContextMenu
            x={ctx.x}
            y={ctx.y}
            items={[{
              label: "Delete",
              icon: <Trash2 className="h-3.5 w-3.5" />,
              variant: "danger",
              onSelect: () => onDeleteFile({ id: node.fileId } as VaultFile, { stopPropagation: () => {} } as unknown as MouseEvent),
            }]}
            onClose={() => setCtx(null)}
          />
        )}
      </>
    );
  }

  const isActiveFolder = activeFolderPath === node.fullPath;
  const folderProject = node.projectId != null ? projects.find((project) => project.id === node.projectId) : null;
  const folderInvestigation = node.caseId ? investigations.find((investigation) => investigation.case_id === node.caseId) : null;
  const isSelected =
    (folderProject && selection?.kind === "project" && selection.id === folderProject.id) ||
    (folderInvestigation && selection?.kind === "investigation" && selection.caseId === folderInvestigation.case_id);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelectFolder(node.fullPath);
          if (folderProject) onSelectProject(folderProject.id);
          if (folderInvestigation) onSelectInvestigation(folderInvestigation.case_id);
          setExpanded((value) => !value);
        }}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className={cn(
          "relative flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left transition-colors hover:bg-[var(--surface-wash)]",
          isSelected && "bg-[var(--accent-soft)] text-[var(--accent)]",
          isActiveFolder && "bg-[var(--surface-wash)]",
        )}
      >
        {isSelected ? (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l bg-[var(--accent)]" />
        ) : null}
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-[var(--overlay-1)] transition-transform", expanded && "rotate-90")} />
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--subtext-1)]">{node.name}</span>
        <span className="font-mono text-[10px] text-[var(--overlay-1)]">{countItems([node])}</span>
      </button>
      {expanded
        ? node.children.map((child) => (
            <PathNode
              key={child.fullPath}
              node={child}
              selection={selection}
              activeFolderPath={activeFolderPath}
              projects={projects}
              investigations={investigations}
              onSelectDoc={onSelectDoc}
              onSelectFile={onSelectFile}
              onSelectWorkspaceFile={onSelectWorkspaceFile}
              onSelectFolder={onSelectFolder}
              onSelectProject={onSelectProject}
              onSelectInvestigation={onSelectInvestigation}
              onDeleteDoc={onDeleteDoc}
              onDeleteFile={onDeleteFile}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-1 flex items-center gap-2 px-2 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">{label}</span>
      <span className="font-mono text-[10px] text-[var(--overlay-0)]">{count}</span>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return <p className="px-2 py-2 text-[11px] text-[var(--overlay-1)]">{message}</p>;
}

function EntityDetail({
  label,
  name,
  meta,
}: {
  label: string;
  name: string;
  meta: { key: string; value: string }[];
}) {
  return (
    <div className="px-[10%] py-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">{label}</p>
      <h2 className="mt-1 text-[22px] font-semibold text-[var(--text)]">{name}</h2>
      <dl className="mt-6 space-y-3">
        {meta.map(({ key, value }) => (
          <div key={key} className="flex gap-4">
            <dt className="w-28 shrink-0 text-[12px] text-[var(--subtext-0)]">{key}</dt>
            <dd className="text-[12px] text-[var(--text)]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function buildSupabaseProjectTree(
  workspaceNodes: WorkspaceNodeSummary[],
  docs: VaultDocument[],
  files: VaultFile[],
): PathTreeNode[] {
  const root: PathTreeNode[] = [];

  const ensureFolderPath = (
    fullPath: string,
    metadata?: { nodeId?: number; projectId?: number | null; caseId?: string | null },
  ) => {
    if (!fullPath) return;

    const parts = fullPath.split("/");
    let nodes = root;

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const folderPath = parts.slice(0, index + 1).join("/");
      let folder = nodes.find(
        (node): node is Extract<PathTreeNode, { kind: "folder" }> =>
          node.kind === "folder" && node.fullPath === folderPath,
      );

      if (!folder) {
        folder = { kind: "folder", name, fullPath: folderPath, children: [] };
        nodes.push(folder);
      }

      if (index === parts.length - 1 && metadata) {
        folder.nodeId = metadata.nodeId ?? folder.nodeId;
        folder.projectId = metadata.projectId ?? folder.projectId ?? null;
        folder.caseId = metadata.caseId ?? folder.caseId ?? null;
      }

      nodes = folder.children;
    }
  };

  const ensurePathParent = (fullPath: string) => {
    const parts = fullPath.split("/").filter(Boolean);
    let nodes = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      const folderPath = parts.slice(0, index + 1).join("/");
      let folder = nodes.find(
        (node): node is Extract<PathTreeNode, { kind: "folder" }> =>
          node.kind === "folder" && node.fullPath === folderPath,
      );

      if (!folder) {
        folder = { kind: "folder", name, fullPath: folderPath, children: [] };
        nodes.push(folder);
      }

      nodes = folder.children;
    }

    return nodes;
  };

  for (const node of workspaceNodes) {
    if (node.kind === "folder") {
      ensureFolderPath(node.path, {
        nodeId: node.id,
        projectId: node.project_id,
        caseId: node.case_id,
      });
      continue;
    }

    const parentNodes = ensurePathParent(node.path);
    parentNodes.push({
      kind: "workspace-file",
      name: node.name,
      fullPath: node.path,
      nodeId: node.id,
    });
  }

  for (const doc of docs) {
    const sourcePath = vaultDocumentPath(doc);
    const parts = sourcePath.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const nodes = ensurePathParent(sourcePath);
    const fileName = parts[parts.length - 1];
    nodes.push({ kind: "doc", name: fileName, fullPath: sourcePath, docId: doc.id });
  }

  for (const file of files) {
    const sourcePath = vaultFileTreePath(file);
    const parts = sourcePath.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const nodes = ensurePathParent(sourcePath);
    const fileName = parts[parts.length - 1];
    nodes.push({ kind: "file", name: fileName, fullPath: sourcePath, fileId: file.id });
  }

  sortPathTree(root);
  return root;
}

function vaultDocumentPath(doc: VaultDocument): string {
  const sourcePath = doc.source_path?.trim();
  if (sourcePath) {
    return sourcePath;
  }

  const fallbackName = ensureMarkdownExtension(slugFromTitle(doc.title || `document-${doc.id}`));
  return `Unfiled/${fallbackName}`;
}

function sortPathTree(nodes: PathTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  for (const node of nodes) {
    if (node.kind === "folder") sortPathTree(node.children);
  }
}

function countItems(nodes: PathTreeNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.kind !== "folder") return sum + 1;
    return sum + countItems(node.children);
  }, 0);
}

function vaultFileTreePath(file: VaultFile): string {
  const rawPath = file.file_path.trim();
  const normalized = rawPath.replace(/^\/+/, "");
  const lower = normalized.toLowerCase();

  if (lower.startsWith("investigations/")) {
    return `Investigations/${normalized.slice("investigations/".length)}`;
  }

  if (lower.startsWith("projects/")) {
    return `Projects/${normalized.slice("projects/".length)}`;
  }

  if (file.case_id) {
    return `Investigations/${file.case_id}/${file.file_name}`;
  }

  if (file.project_id != null) {
    return `Projects/${file.project_id}/${file.file_name}`;
  }

  return `Vault Files/${normalized || file.file_name}`;
}

function saveStatusLabel(status: ReportSaveStatus) {
  if (status === "dirty") return "Unsaved";
  if (status === "saving") return "Saving";
  if (status === "error") return "Save Error";
  return "Saved";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function isEditableVaultFile(file: VaultFile) {
  return file.file_type !== "graph_export";
}

function dirname(path: string | null) {
  if (!path || !path.includes("/")) return null;
  return path.slice(0, path.lastIndexOf("/"));
}

function ensureMarkdownExtension(name: string) {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}

function slugFromTitle(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

function titleFromFileName(name: string) {
  return name.replace(/\.md$/i, "");
}

function validateNewEntryName(name: string, mode: "file" | "folder") {
  if (!name) return "Name is required.";
  if (name === "." || name === "..") return "That name is reserved.";
  if (name.includes("/") || name.includes("\\")) return "Use a single file or folder name, not a path.";
  if (mode === "folder" && /\.md$/i.test(name)) return "Folders cannot end with .md.";
  return null;
}

function getCreateErrorMessage(error: unknown, mode: "file" | "folder") {
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    return "An entry with that name already exists here.";
  }
  if (error instanceof Error) return error.message;
  return `Failed to create ${mode}.`;
}
