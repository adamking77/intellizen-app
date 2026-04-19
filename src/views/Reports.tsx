import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  FolderPlus,
  Layers,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
} from "lucide-react";

import { InlineMarkdownEditor } from "@/components/reports/inline-markdown-editor";
import { ContextMenu } from "@/components/ui/context-menu";
import { MarkdownBody } from "@/components/ui/markdown-body";
import {
  createStrategyFolder,
  createVaultDocument,
  deleteVaultDocument,
  deleteVaultFile,
  getVaultDocument,
  getVaultFile,
  listAllVaultFiles,
  listInvestigations,
  listOperations,
  listProjects,
  listStrategyFolders,
  listVaultDocuments,
  updateVaultDocumentContent,
  updateVaultFileContent,
} from "@/lib/data";
import type { Investigation, Operation, Project, VaultDocument, VaultFile, WorkspaceNodeSummary } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useWindowSize } from "@/lib/use-window-size";

type Selection =
  | { kind: "doc"; id: number }
  | { kind: "file"; id: number }
  | { kind: "operation"; id: number }
  | { kind: "project"; id: number }
  | { kind: "investigation"; caseId: string }
  | null;

type ReportSaveStatus = "idle" | "dirty" | "saving" | "error";

type PathTreeNode =
  | { kind: "folder"; name: string; fullPath: string; children: PathTreeNode[] }
  | { kind: "doc"; name: string; fullPath: string; docId: number };

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
  const { isCramped } = useWindowSize();

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
  const { data: strategyFolders = [] } = useQuery({
    queryKey: ["strategy-folders"],
    queryFn: listStrategyFolders,
  });
  const { data: vaultFiles = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["vault-files-all"],
    queryFn: listAllVaultFiles,
  });
  const { data: operations = [] } = useQuery({
    queryKey: ["operations"],
    queryFn: listOperations,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const { data: investigations = [] } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });

  const isLoading = loadingDocs || loadingFiles;

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

  const docTree = useMemo(() => buildPathTree(vaultDocs, strategyFolders), [strategyFolders, vaultDocs]);
  const selectedFileSummary = useMemo(
    () => (selection?.kind === "file" ? vaultFiles.find((item) => item.id === selection.id) ?? null : null),
    [selection, vaultFiles],
  );
  const selectedOperation = useMemo(
    () => (selection?.kind === "operation" ? operations.find((item) => item.id === selection.id) ?? null : null),
    [operations, selection],
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

  const filesByProject = useMemo(() => {
    const map = new Map<number, VaultFile[]>();
    for (const file of vaultFiles) {
      if (file.project_id == null || file.case_id != null) continue;
      const list = map.get(file.project_id) ?? [];
      list.push(file);
      map.set(file.project_id, list);
    }
    return map;
  }, [vaultFiles]);

  const filesByCase = useMemo(() => {
    const map = new Map<string, VaultFile[]>();
    for (const file of vaultFiles) {
      if (!file.case_id) continue;
      const list = map.get(file.case_id) ?? [];
      list.push(file);
      map.set(file.case_id, list);
    }
    return map;
  }, [vaultFiles]);

  const unlinkedFiles = useMemo(
    () => vaultFiles.filter((file) => file.project_id == null && file.case_id == null),
    [vaultFiles],
  );

  useEffect(() => {
    if (selection?.kind === "doc") {
      if (!selectedDoc) {
        setFileContent(null);
        setPersistedContent("");
        setSaveStatus("idle");
        return;
      }

      const normalized = selectedDoc.content ?? "";
      setFileContent(normalized);
      setPersistedContent(normalized);
      setSaveStatus("idle");
      return;
    }

    if (selection?.kind === "file") {
      if (!selectedFile) {
        setFileContent(null);
        setPersistedContent("");
        setSaveStatus("idle");
        return;
      }

      const normalized = selectedFile.content ?? "";
      setFileContent(normalized);
      setPersistedContent(normalized);
      setSaveStatus("idle");
      return;
    }

    setFileContent(null);
    setPersistedContent("");
    setSaveStatus("idle");
  }, [selectedDoc, selectedFile, selection]);

  useEffect(() => {
    if (fileContent === null || saveStatus !== "dirty" || fileContent === persistedContent) return;

    if (selection?.kind === "doc") {
      const timer = window.setTimeout(async () => {
        try {
          setSaveStatus("saving");
          const updated = await updateVaultDocumentContent(selection.id, fileContent);
          queryClient.setQueryData(["vault-document", selection.id], updated);
          queryClient.setQueryData(["vault-documents"], (prev: VaultDocument[] | undefined) =>
            prev?.map((doc) => (doc.id === updated.id ? { ...doc, updated_at: updated.updated_at } : doc)) ?? prev,
          );
          setPersistedContent(fileContent);
          setSaveStatus("idle");
        } catch {
          setSaveStatus("error");
        }
      }, 700);

      return () => window.clearTimeout(timer);
    }

    if (selection?.kind === "file" && isFileEditable) {
      const timer = window.setTimeout(async () => {
        try {
          setSaveStatus("saving");
          const updated = await updateVaultFileContent(selection.id, fileContent);
          queryClient.setQueryData(["vault-file", selection.id], updated);
          queryClient.setQueryData(["vault-files-all"], (prev: VaultFile[] | undefined) =>
            prev?.map((file) => (file.id === updated.id ? updated : file)) ?? prev,
          );
          setPersistedContent(fileContent);
          setSaveStatus("idle");
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
        : null;

  const showSaveStatus = selection?.kind === "doc" || (selection?.kind === "file" && isFileEditable);
  const createTargetPath = activeStrategyFolderPath ?? (selection?.kind === "doc" ? dirname(selectedDoc?.source_path ?? null) : null);
  const createTargetLabel = createTargetPath ?? "Strategy Vault";

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
        const createdFolder = await createStrategyFolder({
          name: rawName,
          parentPath: createTargetPath,
        });
        await queryClient.invalidateQueries({ queryKey: ["strategy-folders"] });
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

  return (
    <div className="relative flex h-[calc(100dvh)] w-full overflow-hidden bg-[var(--base)]">
      <aside
        style={{ width: leftOpen ? 300 : 0 }}
        className={cn(
          "relative flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--mantle)]",
          "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        {leftOpen ? (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
              <span className="text-label">Reports</span>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                </div>
              ) : (
                <>
                  <SectionHeader label="Strategy Vault" count={vaultDocs.length} />
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
                  {docTree.length === 0 ? (
                    <EmptySection message="No vault documents found." />
                  ) : (
                    docTree.map((node) => (
                      <PathNode
                        key={node.fullPath}
                        node={node}
                        selection={selection}
                        activeFolderPath={activeStrategyFolderPath}
                        onSelectDoc={(id) => setSelection({ kind: "doc", id })}
                        onSelectFolder={setActiveStrategyFolderPath}
                        onDeleteDoc={handleDeleteDoc}
                        depth={0}
                      />
                    ))
                  )}

                  <div className="mt-4">
                    <SectionHeader label="Intelligence" count={vaultFiles.length} />
                    <IntelTree
                      operations={operations}
                      projects={projects}
                      investigations={investigations}
                      filesByProject={filesByProject}
                      filesByCase={filesByCase}
                      unlinkedFiles={unlinkedFiles}
                      selection={selection}
                      onSelect={setSelection}
                      onDeleteFile={handleDeleteFile}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4">
          <div className="flex min-w-0 items-center gap-3">
            {!leftOpen ? (
              <button
                type="button"
                onClick={() => setLeftOpen(true)}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            ) : null}
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

        <div className="flex-1 overflow-y-auto">
          {selection?.kind === "doc" && selectedDoc ? (
            <div className="px-[10%] py-10">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
                {selectedDoc.document_type} · {selectedDoc.domain}
              </p>
              <h2 className="mt-1 text-[20px] font-semibold text-[var(--text)]">{selectedDoc.title}</h2>
              <p className="mt-1 font-mono text-[10px] text-[var(--overlay-1)]">{selectedDoc.source_path}</p>
              <div className="mt-4">
                <InlineMarkdownEditor
                  key={`doc-${selection.id}`}
                  initialValue={fileContent ?? ""}
                  onChange={handleEditorChange}
                />
              </div>
            </div>
          ) : selection?.kind === "doc" ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className={cn("h-4 w-4 text-[var(--subtext-0)]", loadingDoc && "animate-spin")} />
            </div>
          ) : selection?.kind === "file" && selectedFile ? (
            isFileEditable ? (
              <div className="px-[10%] py-10">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
                  {selectedFile.file_type.replace(/_/g, " ")}
                </p>
                <h2 className="mt-1 text-[20px] font-semibold text-[var(--text)]">{selectedFile.file_name}</h2>
                <p className="mt-1 font-mono text-[10px] text-[var(--overlay-1)]">{selectedFile.file_path}</p>
                <div className="mt-4">
                  <InlineMarkdownEditor
                    key={`file-${selection.id}`}
                    initialValue={fileContent ?? ""}
                    onChange={handleEditorChange}
                  />
                </div>
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
          ) : selectedOperation ? (
            <EntityDetail
              label="Operation"
              name={selectedOperation.name}
              meta={[
                { key: "Status", value: selectedOperation.status },
                { key: "Description", value: selectedOperation.description ?? "—" },
                { key: "Created", value: fmtDate(selectedOperation.created_at) },
              ]}
            />
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
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-[var(--subtext-0)]">
              Select a document to open it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PathNode({
  node,
  selection,
  activeFolderPath,
  onSelectDoc,
  onSelectFolder,
  onDeleteDoc,
  depth,
}: {
  node: PathTreeNode;
  selection: Selection;
  activeFolderPath: string | null;
  onSelectDoc: (id: number) => void;
  onSelectFolder: (path: string) => void;
  onDeleteDoc: (id: number) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  if (node.kind === "doc") {
    const isSelected = selection?.kind === "doc" && selection.id === node.docId;
    return (
      <>
        <button
          type="button"
          onClick={() => onSelectDoc(node.docId)}
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
        {ctx && (
          <ContextMenu
            x={ctx.x}
            y={ctx.y}
            items={[{ label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, variant: "danger", onSelect: () => onDeleteDoc(node.docId) }]}
            onClose={() => setCtx(null)}
          />
        )}
      </>
    );
  }

  const isActiveFolder = activeFolderPath === node.fullPath;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelectFolder(node.fullPath);
          setExpanded((value) => !value);
        }}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className={cn(
          "flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left transition-colors hover:bg-[var(--surface-wash)]",
          isActiveFolder && "bg-[var(--surface-wash)]",
        )}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-[var(--overlay-1)] transition-transform", expanded && "rotate-90")} />
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--subtext-1)]">{node.name}</span>
        <span className="font-mono text-[10px] text-[var(--overlay-1)]">{countDocs(node)}</span>
      </button>
      {expanded
        ? node.children.map((child) => (
            <PathNode
              key={child.fullPath}
              node={child}
              selection={selection}
              activeFolderPath={activeFolderPath}
              onSelectDoc={onSelectDoc}
              onSelectFolder={onSelectFolder}
              onDeleteDoc={onDeleteDoc}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

function IntelTree({
  operations,
  projects,
  investigations,
  filesByProject,
  filesByCase,
  unlinkedFiles,
  selection,
  onSelect,
  onDeleteFile,
}: {
  operations: Operation[];
  projects: Project[];
  investigations: Investigation[];
  filesByProject: Map<number, VaultFile[]>;
  filesByCase: Map<string, VaultFile[]>;
  unlinkedFiles: VaultFile[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onDeleteFile: (file: VaultFile, event: MouseEvent) => void;
}) {
  const projectsByOp = useMemo(() => groupBy(projects, (project) => String(project.operation_id ?? "__none__")), [projects]);
  const investigationsByProject = useMemo(
    () => groupBy(investigations, (investigation) => String(investigation.project_id ?? "__none__")),
    [investigations],
  );
  const standaloneInvestigations = investigations.filter(
    (investigation) =>
      investigation.project_id == null && !operations.some((operation) => operation.id === investigation.operation_id),
  );

  if (
    operations.length === 0
    && projects.length === 0
    && investigations.length === 0
    && unlinkedFiles.length === 0
  ) {
    return <EmptySection message="No intelligence data yet." />;
  }

  return (
    <div className="space-y-0.5">
      {operations.map((operation) => (
        <IntelFolderRow
          key={`op-${operation.id}`}
          icon={<Layers className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
          label={operation.name}
          isSelected={selection?.kind === "operation" && selection.id === operation.id}
          onSelect={() => onSelect({ kind: "operation", id: operation.id })}
          depth={0}
        >
          {(projectsByOp.get(String(operation.id)) ?? []).map((project) => (
            <IntelProjectNode
              key={`proj-${project.id}`}
              project={project}
              files={filesByProject.get(project.id) ?? []}
              investigations={investigationsByProject.get(String(project.id)) ?? []}
              filesByCase={filesByCase}
              selection={selection}
              onSelect={onSelect}
              onDeleteFile={onDeleteFile}
              depth={1}
            />
          ))}
        </IntelFolderRow>
      ))}

      {projects
        .filter((project) => project.operation_id == null)
        .map((project) => (
          <IntelProjectNode
            key={`proj-${project.id}`}
            project={project}
            files={filesByProject.get(project.id) ?? []}
            investigations={investigationsByProject.get(String(project.id)) ?? []}
            filesByCase={filesByCase}
            selection={selection}
            onSelect={onSelect}
            onDeleteFile={onDeleteFile}
            depth={0}
          />
        ))}

      {standaloneInvestigations.map((investigation) => (
        <IntelInvNode
          key={investigation.case_id}
          investigation={investigation}
          files={filesByCase.get(investigation.case_id) ?? []}
          selection={selection}
          onSelect={onSelect}
          onDeleteFile={onDeleteFile}
          depth={0}
        />
      ))}

      {unlinkedFiles.length > 0 ? (
        <IntelFolderRow
          icon={<FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
          label="Unlinked Files"
          isSelected={false}
          onSelect={() => {}}
          depth={0}
        >
          {unlinkedFiles.map((file) => (
            <IntelFileRow
              key={file.id}
              file={file}
              isSelected={selection?.kind === "file" && selection.id === file.id}
              onSelect={() => onSelect({ kind: "file", id: file.id })}
              onDelete={onDeleteFile}
              depth={1}
            />
          ))}
        </IntelFolderRow>
      ) : null}
    </div>
  );
}

function IntelProjectNode({
  project,
  files,
  investigations,
  filesByCase,
  selection,
  onSelect,
  onDeleteFile,
  depth,
}: {
  project: Project;
  files: VaultFile[];
  investigations: Investigation[];
  filesByCase: Map<string, VaultFile[]>;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onDeleteFile: (file: VaultFile, event: MouseEvent) => void;
  depth: number;
}) {
  return (
    <IntelFolderRow
      icon={<FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
      label={project.name}
      isSelected={selection?.kind === "project" && selection.id === project.id}
      onSelect={() => onSelect({ kind: "project", id: project.id })}
      depth={depth}
    >
      {files.map((file) => (
        <IntelFileRow
          key={file.id}
          file={file}
          isSelected={selection?.kind === "file" && selection.id === file.id}
          onSelect={() => onSelect({ kind: "file", id: file.id })}
          onDelete={onDeleteFile}
          depth={depth + 1}
        />
      ))}
      {investigations.map((investigation) => (
        <IntelInvNode
          key={investigation.case_id}
          investigation={investigation}
          files={filesByCase.get(investigation.case_id) ?? []}
          selection={selection}
          onSelect={onSelect}
          onDeleteFile={onDeleteFile}
          depth={depth + 1}
        />
      ))}
    </IntelFolderRow>
  );
}

function IntelInvNode({
  investigation,
  files,
  selection,
  onSelect,
  onDeleteFile,
  depth,
}: {
  investigation: Investigation;
  files: VaultFile[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onDeleteFile: (file: VaultFile, event: MouseEvent) => void;
  depth: number;
}) {
  return (
    <IntelFolderRow
      icon={<FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--subtext-1)]" />}
      label={investigation.name}
      isSelected={selection?.kind === "investigation" && selection.caseId === investigation.case_id}
      onSelect={() => onSelect({ kind: "investigation", caseId: investigation.case_id })}
      depth={depth}
    >
      {files.map((file) => (
        <IntelFileRow
          key={file.id}
          file={file}
          isSelected={selection?.kind === "file" && selection.id === file.id}
          onSelect={() => onSelect({ kind: "file", id: file.id })}
          onDelete={onDeleteFile}
          depth={depth + 1}
        />
      ))}
    </IntelFolderRow>
  );
}

function IntelFolderRow({
  icon,
  label,
  isSelected,
  onSelect,
  depth,
  children,
}: {
  icon: ReactNode;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  depth: number;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !!children && (Array.isArray(children) ? children.length > 0 : true);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect();
          setExpanded((value) => !value);
        }}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
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
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-[var(--overlay-1)] transition-transform",
            expanded && hasChildren && "rotate-90",
            !hasChildren && "opacity-0",
          )}
        />
        {icon}
        <span className="min-w-0 flex-1 truncate text-[12px]">{label}</span>
      </button>
      {expanded ? children : null}
    </div>
  );
}

function IntelFileRow({
  file,
  isSelected,
  onSelect,
  onDelete,
  depth,
}: {
  file: VaultFile;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (file: VaultFile, event: MouseEvent) => void;
  depth: number;
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  function triggerDelete() {
    onDelete(file, { stopPropagation: () => {} } as unknown as MouseEvent);
  }

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={cn(
          "group relative flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left transition-colors",
          isSelected
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]",
        )}
      >
        {isSelected ? (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l bg-[var(--accent)]" />
        ) : null}
        <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="min-w-0 flex-1 truncate text-[12px]">{file.file_name}</span>
        <span
          role="button"
          tabIndex={-1}
          onClick={(event) => onDelete(file, event)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onDelete(file, event as unknown as MouseEvent);
            }
          }}
          className="ml-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:text-[var(--danger)] group-hover:flex"
        >
          <Trash2 className="h-3 w-3" />
        </span>
      </button>
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={[{ label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, variant: "danger", onSelect: triggerDelete }]}
          onClose={() => setCtx(null)}
        />
      )}
    </>
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

function buildPathTree(docs: VaultDocument[], folders: WorkspaceNodeSummary[]): PathTreeNode[] {
  const root: PathTreeNode[] = [];

  const ensureFolderPath = (fullPath: string) => {
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

      nodes = folder.children;
    }
  };

  for (const folder of folders) {
    ensureFolderPath(folder.path);
  }

  for (const doc of docs) {
    const parts = doc.source_path.split("/");
    let nodes = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      const fullPath = parts.slice(0, index + 1).join("/");
      let folder = nodes.find(
        (node): node is Extract<PathTreeNode, { kind: "folder" }> =>
          node.kind === "folder" && node.name === name,
      );

      if (!folder) {
        folder = { kind: "folder", name, fullPath, children: [] };
        nodes.push(folder);
      }

      nodes = folder.children;
    }

    const fileName = parts[parts.length - 1];
    nodes.push({ kind: "doc", name: fileName, fullPath: doc.source_path, docId: doc.id });
  }

  sortPathTree(root);
  return root;
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

function countDocs(node: PathTreeNode): number {
  if (node.kind === "doc") return 1;
  return node.children.reduce((sum, child) => sum + countDocs(child), 0);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const list = map.get(groupKey) ?? [];
    list.push(item);
    map.set(groupKey, list);
  }
  return map;
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
