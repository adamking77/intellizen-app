import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronRight, FileSearch, FolderSearch, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { InvestigationCreateModal } from "@/components/investigations/investigation-create-modal";
import { AssignProjectsModal } from "@/components/projects/assign-projects-modal";
import { OperationCreateModal } from "@/components/projects/operation-create-modal";
import { VaultFileRow } from "@/components/vault/vault-file-row";
import { ProjectCreateModal } from "@/components/projects/project-create-modal";
import { SignalCard } from "@/components/signals/signal-card";
import { Button } from "@/components/ui/button";
import { IndicatorStrip, type IndicatorItem } from "@/components/ui/indicator-strip";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { domainColor } from "@/lib/domains";
import { cn } from "@/lib/utils";
import {
  deleteOperation,
  deleteProject,
  listOperations,
  listProjectSignalCounts,
  listProjectSignals,
  listProjectVaultFiles,
  listProjects,
  removeSignalFromProject,
  updateOperation,
  updateProject,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import type { Operation, Project, ProjectSignal, VaultFile } from "@/lib/types";
import { useAppStore } from "@/store";

type StatusFilter = "all" | "active" | "archived";

type Selection =
  | { kind: "project"; id: number }
  | { kind: "operation"; id: number }
  | null;

function formatElapsed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function sortVaultFiles(files: VaultFile[]): VaultFile[] {
  return [...files].sort((a, b) => {
    const weight = (f: VaultFile) => (f.file_type === "graph_export" ? 0 : 1);
    const w = weight(a) - weight(b);
    if (w !== 0) return w;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function ProjectsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSearchTargetProjectId = useAppStore((state) => state.setSearchTargetProjectId);
  const pendingProjectSelectionId = useAppStore((state) => state.pendingProjectSelectionId);
  const setPendingProjectSelectionId = useAppStore((state) => state.setPendingProjectSelectionId);

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createOperationOpen, setCreateOperationOpen] = useState(false);
  const [investigationModalOpen, setInvestigationModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteOperationConfirmOpen, setDeleteOperationConfirmOpen] = useState(false);
  const [assignProjectsOpen, setAssignProjectsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selection, setSelection] = useState<Selection>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesStatus, setNotesStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [operationDescDraft, setOperationDescDraft] = useState("");
  const [operationDescStatus, setOperationDescStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [collapsedOps, setCollapsedOps] = useState<Set<number>>(new Set());

  // Resizable left rail
  const [railWidth, setRailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 320;
    const saved = window.localStorage.getItem("projects-rail-width");
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(parsed) ? Math.max(260, Math.min(480, parsed)) : 320;
  });

  useEffect(() => {
    window.localStorage.setItem("projects-rail-width", String(railWidth));
  }, [railWidth]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = railWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setRailWidth(Math.max(260, Math.min(480, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const { data: operations } = useQuery({
    queryKey: ["operations"],
    queryFn: listOperations,
  });

  const { data: projects, error } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const { data: signalCounts } = useQuery({
    queryKey: ["project-signal-counts"],
    queryFn: listProjectSignalCounts,
  });

  const filtered = useMemo(() => {
    const src = projects ?? [];
    if (statusFilter === "all") return src;
    return src.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  // Group projects by operation_id
  const { operationGroups, unassigned } = useMemo(() => {
    const ops = operations ?? [];
    const grouped: Array<{ operation: Operation; projects: Project[] }> = ops
      .filter((op) => statusFilter === "all" || op.status === statusFilter)
      .map((op) => ({
        operation: op,
        projects: filtered.filter((p) => p.operation_id === op.id),
      }));
    const assignedIds = new Set(ops.map((op) => op.id));
    const unassignedProjects = filtered.filter(
      (p) => !p.operation_id || !assignedIds.has(p.operation_id),
    );
    return { operationGroups: grouped, unassigned: unassignedProjects };
  }, [operations, filtered, statusFilter]);

  // Derived selection objects
  const selectedProjectId = selection?.kind === "project" ? selection.id : null;
  const selectedOperationId = selection?.kind === "operation" ? selection.id : null;

  const selectedProject = useMemo(
    () => projects?.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedOperation = useMemo(
    () => (operations ?? []).find((op) => op.id === selectedOperationId) ?? null,
    [operations, selectedOperationId],
  );

  // Projects belonging to the selected operation
  const operationProjects = useMemo(
    () => (projects ?? []).filter((p) => p.operation_id === selectedOperationId),
    [projects, selectedOperationId],
  );

  // Handle pending project selection (from store)
  useEffect(() => {
    if (pendingProjectSelectionId == null) return;
    const target = (projects ?? []).find((p) => p.id === pendingProjectSelectionId);
    if (!target) return;
    if (target.status !== statusFilter && statusFilter !== "all") setStatusFilter("all");
    setSelection({ kind: "project", id: target.id });
    setPendingProjectSelectionId(null);
  }, [pendingProjectSelectionId, projects, statusFilter, setPendingProjectSelectionId]);

  // Auto-select first item
  useEffect(() => {
    if (selection !== null) return;
    const firstOp = (operations ?? [])[0];
    if (firstOp) { setSelection({ kind: "operation", id: firstOp.id }); return; }
    const firstProject = filtered[0];
    if (firstProject) setSelection({ kind: "project", id: firstProject.id });
  }, [operations, filtered, selection]);

  // Sync notes draft when project changes
  useEffect(() => {
    if (!selectedProject) return;
    setNotesDraft(selectedProject.notes ?? "");
    setNotesStatus("idle");
    setNameDraft(selectedProject.name);
    setEditingName(false);
  }, [selectedProject?.id]);

  // Sync operation description draft
  useEffect(() => {
    if (!selectedOperation) return;
    setOperationDescDraft(selectedOperation.description ?? "");
    setOperationDescStatus("idle");
    setNameDraft(selectedOperation.name);
    setEditingName(false);
  }, [selectedOperation?.id]);

  const { data: projectSignals } = useQuery({
    queryKey: ["project-signals", selectedProjectId],
    queryFn: () => listProjectSignals(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const { data: projectVaultFilesRaw } = useQuery({
    queryKey: ["project-vault-files", selectedProjectId],
    queryFn: () => listProjectVaultFiles(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const projectVaultFiles = useMemo(
    () => sortVaultFiles(projectVaultFilesRaw ?? []),
    [projectVaultFilesRaw],
  );

  const stats = useMemo(() => {
    const list = projects ?? [];
    const active = list.filter((p) => p.status === "active").length;
    const archived = list.filter((p) => p.status === "archived").length;
    const lastUpdated = list.map((p) => p.updated_at).filter(Boolean).sort().pop();
    const totalSignals = Object.values(signalCounts ?? {}).reduce((a, b) => a + b, 0);
    return { active, archived, lastUpdated, totalSignals, total: list.length };
  }, [projects, signalCounts]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveNotesMutation = useMutation({
    mutationFn: (value: string) => updateProject(selectedProjectId as number, { notes: value }),
    onMutate: () => setNotesStatus("saving"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNotesStatus("saved");
    },
    onError: (err) => { setNotesStatus("dirty"); toastError("Couldn't save notes", err); },
  });

  useEffect(() => {
    if (notesStatus !== "dirty" || selectedProjectId == null) return;
    const handle = window.setTimeout(() => saveNotesMutation.mutate(notesDraft), 700);
    return () => window.clearTimeout(handle);
  }, [notesDraft, notesStatus, selectedProjectId]);

  useEffect(() => {
    if (notesStatus !== "saved") return;
    const handle = window.setTimeout(() => setNotesStatus("idle"), 1800);
    return () => window.clearTimeout(handle);
  }, [notesStatus]);

  const saveOperationDescMutation = useMutation({
    mutationFn: (value: string) => updateOperation(selectedOperationId as number, { description: value }),
    onMutate: () => setOperationDescStatus("saving"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      setOperationDescStatus("saved");
    },
    onError: (err) => { setOperationDescStatus("dirty"); toastError("Couldn't save description", err); },
  });

  useEffect(() => {
    if (operationDescStatus !== "dirty" || selectedOperationId == null) return;
    const handle = window.setTimeout(() => saveOperationDescMutation.mutate(operationDescDraft), 700);
    return () => window.clearTimeout(handle);
  }, [operationDescDraft, operationDescStatus, selectedOperationId]);

  useEffect(() => {
    if (operationDescStatus !== "saved") return;
    const handle = window.setTimeout(() => setOperationDescStatus("idle"), 1800);
    return () => window.clearTimeout(handle);
  }, [operationDescStatus]);

  const toggleStatusMutation = useMutation({
    mutationFn: () =>
      updateProject(selectedProjectId as number, {
        status: selectedProject?.status === "active" ? "archived" : "active",
      }),
    onMutate: async () => {
      if (!selectedProjectId) return;
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      const previous = queryClient.getQueryData<Project[]>(["projects"]);
      const nextStatus = selectedProject?.status === "active" ? "archived" : "active";
      queryClient.setQueryData<Project[]>(["projects"], (old) =>
        (old ?? []).map((p) => p.id === selectedProjectId ? { ...p, status: nextStatus } : p),
      );
      return { previous, nextStatus };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["projects"], context.previous);
      toastError("Couldn't update project", err);
    },
    onSuccess: (_, __, context) => {
      toast.success(context?.nextStatus === "archived" ? "Project archived" : "Project reactivated");
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ["projects"] }); },
  });

  const renameMutation = useMutation<void, Error, string>({
    mutationFn: async (name: string) => {
      if (selection?.kind === "project") await updateProject(selection.id, { name });
      else if (selection?.kind === "operation") await updateOperation(selection.id, { name });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      setEditingName(false);
      toast.success("Renamed");
    },
    onError: (err) => toastError("Couldn't rename", err),
  });

  function commitRename() {
    const trimmed = nameDraft.trim();
    const currentName = selectedProject?.name ?? selectedOperation?.name ?? "";
    setEditingName(false);
    if (!trimmed || trimmed === currentName) {
      setNameDraft(currentName);
      return;
    }
    renameMutation.mutate(trimmed);
  }

  const removeSignalMutation = useMutation({
    mutationFn: removeSignalFromProject,
    onMutate: async (projectSignalId: number) => {
      const key = ["project-signals", selectedProjectId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectSignal[]>(key);
      queryClient.setQueryData<ProjectSignal[]>(key, (old) =>
        (old ?? []).filter((ps) => ps.id !== projectSignalId),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["project-signals", selectedProjectId], context.previous);
      toastError("Couldn't remove signal", err);
    },
    onSuccess: () => toast.success("Signal removed"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-signals", selectedProjectId] });
      void queryClient.invalidateQueries({ queryKey: ["project-signal-counts"] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: async () => {
      setSelection(null);
      setDeleteConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project-signal-counts"] });
      toast.success("Project deleted");
    },
    onError: (err) => toastError("Couldn't delete project", err),
  });

  const assignOperationMutation = useMutation({
    mutationFn: ({ projectId, operationId }: { projectId: number; operationId: number | null }) =>
      updateProject(projectId, { operation_id: operationId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Operation updated");
    },
    onError: (err) => toastError("Couldn't update operation", err),
  });

  const bulkAssignMutation = useMutation<void, Error, number[]>({
    mutationFn: async (projectIds) => {
      await Promise.all(
        projectIds.map((id) => updateProject(id, { operation_id: selectedOperationId })),
      );
    },
    onSuccess: async (_, projectIds) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setAssignProjectsOpen(false);
      toast.success(`${projectIds.length} project${projectIds.length === 1 ? "" : "s"} assigned`);
    },
    onError: (err) => toastError("Couldn't assign projects", err),
  });

  const deleteOperationMutation = useMutation({
    mutationFn: (id: number) => deleteOperation(id),
    onSuccess: async () => {
      setSelection(null);
      setDeleteOperationConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Operation deleted");
    },
    onError: (err) => toastError("Couldn't delete operation", err),
  });

  // ── Indicators ─────────────────────────────────────────────────────────────

  const indicators: IndicatorItem[] = [
    { label: "Total", value: stats.total, onClick: () => setStatusFilter("all"), active: statusFilter === "all" },
    { label: "Active", value: stats.active, status: stats.active > 0 ? "active" : "neutral", onClick: () => setStatusFilter("active"), active: statusFilter === "active" },
    { label: "Archived", value: stats.archived, status: stats.archived > 0 ? "warning" : "neutral", onClick: () => setStatusFilter("archived"), active: statusFilter === "archived" },
    { label: "Last touch", value: formatElapsed(stats.lastUpdated) },
  ];

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Projects unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">{error.message}</p>
        </div>
      </div>
    );
  }

  // ── Rail item renderer ─────────────────────────────────────────────────────

  function renderProject(project: Project, indent = false) {
    const isSelected = selection?.kind === "project" && selection.id === project.id;
    const count = signalCounts?.[project.id] ?? 0;
    const domain = project.watch_domain;
    const dot = project.status === "active" ? "var(--success)" : "var(--overlay-1)";
    return (
      <button
        key={project.id}
        type="button"
        data-selected={isSelected ? "true" : undefined}
        onClick={() => setSelection({ kind: "project", id: project.id })}
        className={cn(
          "group/row relative flex w-full cursor-pointer items-start gap-3 border-b border-[var(--border-subtle)] py-3 pr-3 text-left",
          "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isSelected
            ? "bg-[var(--accent-soft)] pl-[13px]"
            : indent
              ? "pl-10 hover:bg-[var(--surface-wash)]"
              : "pl-4 hover:bg-[var(--surface-wash)]",
          project.status === "archived" && "opacity-50",
        )}
      >
        {isSelected && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" />
        )}
        <span aria-hidden className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className={cn(
              "min-w-0 flex-1 truncate font-ui text-[13px] font-medium",
              isSelected ? "text-[var(--accent)]" : indent ? "text-[var(--subtext-0)]" : "text-[var(--text)]",
            )}>
              {project.name}
            </p>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--overlay-1)]">{count}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[11px]">
            {indent && (
              <>
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--overlay-1)]">Project</span>
                <span aria-hidden className="text-[var(--overlay-0)]">·</span>
              </>
            )}
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--subtext-0)]">
              {project.type.replace("_", " ")}
            </span>
            {project.status === "archived" && (
              <>
                <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                <span className="font-ui text-[10px] uppercase tracking-[0.08em] text-[var(--warning)]">Archived</span>
              </>
            )}
            {domain && (
              <>
                <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                <span className="min-w-0 truncate font-mono text-[11px] text-[var(--overlay-1)]">{domain}</span>
              </>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Topbar */}
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Operations</span>
          <IndicatorStrip items={indicators} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => setCreateOperationOpen(true)} className="gap-1.5">
            <Plus className="h-3 w-3" />
            New operation
          </Button>
          <Button size="sm" variant="accent-outline" onClick={() => setCreateProjectOpen(true)} className="gap-1.5">
            <Plus className="h-3 w-3" />
            New project
          </Button>
        </div>
      </div>

      {/* Content: rail + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Rail */}
        <aside
          style={{ width: railWidth }}
          className="relative flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--base)]"
        >
          <div className="flex-1 overflow-y-auto">
            {operationGroups.length === 0 && unassigned.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <p className="text-label">No projects</p>
                <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                  Create an operation to group related research, or add a standalone project.
                </p>
                <Button size="sm" onClick={() => setCreateProjectOpen(true)} className="mt-2 gap-1.5">
                  <Plus className="h-3 w-3" />
                  New project
                </Button>
              </div>
            ) : (
              <>
                {/* Operations with their projects */}
                {operationGroups.map(({ operation, projects: opProjects }) => {
                  const isOpSelected = selection?.kind === "operation" && selection.id === operation.id;
                  const isCollapsed = collapsedOps.has(operation.id);
                  const toggleCollapse = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    setCollapsedOps((prev) => {
                      const next = new Set(prev);
                      if (next.has(operation.id)) next.delete(operation.id);
                      else next.add(operation.id);
                      return next;
                    });
                  };
                  return (
                    <div key={operation.id}>
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "operation", id: operation.id })}
                        className={cn(
                          "relative flex w-full items-center gap-3 border-b border-[var(--border-subtle)] py-3 pr-3 text-left",
                          "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          isOpSelected
                            ? "bg-[var(--accent-soft)] pl-[13px]"
                            : "pl-4 hover:bg-[var(--surface-wash)]",
                        )}
                      >
                        {isOpSelected && (
                          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" />
                        )}
                        <Layers
                          aria-hidden
                          strokeWidth={1.5}
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isOpSelected ? "text-[var(--accent)]" : "text-[var(--subtext-0)]",
                          )}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={cn(
                            "min-w-0 truncate font-ui text-[13px] font-semibold",
                            isOpSelected ? "text-[var(--accent)]" : "text-[var(--text)]",
                          )}>
                            {operation.name}
                          </span>
                          <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--overlay-1)]">
                            Operation · {opProjects.length} project{opProjects.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {opProjects.length > 0 && (
                          <span
                            role="button"
                            aria-label={isCollapsed ? "Expand" : "Collapse"}
                            onClick={toggleCollapse}
                            className="ml-auto shrink-0 rounded p-0.5 text-[var(--overlay-1)] hover:text-[var(--text)]"
                          >
                            {isCollapsed
                              ? <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                              : <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                            }
                          </span>
                        )}
                      </button>
                      {!isCollapsed && opProjects.map((p) => renderProject(p, true))}
                    </div>
                  );
                })}

                {/* Unassigned projects */}
                {unassigned.length > 0 && (
                  <div>
                    {(operationGroups.length > 0) && (
                      <div className="border-b border-[var(--border-subtle)] px-4 py-2.5">
                        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-0)]">
                          Unassigned
                        </span>
                      </div>
                    )}
                    {unassigned.map((p) => renderProject(p, false))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize project list"
            onMouseDown={startResize}
            onDoubleClick={() => setRailWidth(320)}
            className="group/resize absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 w-[2px] bg-transparent transition-colors duration-150 group-hover/resize:bg-[var(--accent)]/60 group-active/resize:bg-[var(--accent)]"
            />
          </div>
        </aside>

        {/* Detail pane */}
        <section className="flex flex-1 flex-col overflow-hidden bg-[var(--base)]">
          {selectedProject ? (
            <ProjectDetailPane
              project={selectedProject}
              operations={operations ?? []}
              projectSignals={projectSignals ?? []}
              vaultFiles={projectVaultFiles}
              signalCounts={signalCounts ?? {}}
              notesDraft={notesDraft}
              notesStatus={notesStatus}
              editingName={editingName}
              nameDraft={nameDraft}
              renamePending={renameMutation.isPending}
              deletePending={deleteProjectMutation.isPending}
              onNotesChange={(v) => { setNotesDraft(v); setNotesStatus("dirty"); }}
              onEditNameStart={() => { setNameDraft(selectedProject.name); setEditingName(true); }}
              onNameDraftChange={setNameDraft}
              onCommitRename={commitRename}
              onCancelRename={() => { setEditingName(false); setNameDraft(selectedProject.name); }}
              onAddFromSearch={() => { setSearchTargetProjectId(selectedProject.id); navigate("/search"); }}
              onOpenInvestigation={() => setInvestigationModalOpen(true)}
              onToggleStatus={() => toggleStatusMutation.mutate()}
              onDeleteClick={() => setDeleteConfirmOpen(true)}
              onSignalRemove={(id) => removeSignalMutation.mutate(id)}
              onVaultFileDeleted={() => void queryClient.invalidateQueries({ queryKey: ["project-vault-files", selectedProject.id] })}
              onAssignOperation={(opId) => assignOperationMutation.mutate({ projectId: selectedProject.id, operationId: opId })}
            />
          ) : selectedOperation ? (
            <OperationDetailPane
              operation={selectedOperation}
              operationProjects={operationProjects}
              signalCounts={signalCounts ?? {}}
              descDraft={operationDescDraft}
              descStatus={operationDescStatus}
              editingName={editingName}
              nameDraft={nameDraft}
              renamePending={renameMutation.isPending}
              deletePending={deleteOperationMutation.isPending}
              onDescChange={(v) => { setOperationDescDraft(v); setOperationDescStatus("dirty"); }}
              onEditNameStart={() => { setNameDraft(selectedOperation.name); setEditingName(true); }}
              onNameDraftChange={setNameDraft}
              onCommitRename={commitRename}
              onCancelRename={() => { setEditingName(false); setNameDraft(selectedOperation.name); }}
              onNewProject={() => setCreateProjectOpen(true)}
              onNewInvestigation={() => setInvestigationModalOpen(true)}
              onDeleteClick={() => setDeleteOperationConfirmOpen(true)}
              onSelectProject={(id) => setSelection({ kind: "project", id })}
              allProjects={projects ?? []}
              onAssignProject={() => setAssignProjectsOpen(true)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
              <p className="text-label">Select a project or operation</p>
              <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                Pick one from the list to inspect details.
              </p>
            </div>
          )}
        </section>
      </div>

      <ProjectCreateModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={(id) => setSelection({ kind: "project", id })}
        initialOperationId={selectedOperationId}
      />

      <OperationCreateModal
        open={createOperationOpen}
        onClose={() => setCreateOperationOpen(false)}
        onCreated={(id) => setSelection({ kind: "operation", id })}
      />

      <DeleteConfirmModal
        open={deleteConfirmOpen && !!selectedProject}
        title={selectedProject?.name ?? ""}
        label="Delete project"
        description="Removes the project and its signal associations permanently."
        footnote="Source signals are not deleted — they stay in Inbox."
        isPending={deleteProjectMutation.isPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => { if (selectedProject) deleteProjectMutation.mutate(selectedProject.id); }}
      />

      <DeleteConfirmModal
        open={deleteOperationConfirmOpen && !!selectedOperation}
        title={selectedOperation?.name ?? ""}
        label="Delete operation"
        description="Removes the operation. Projects in this operation become unassigned."
        footnote="Projects and their signals are not deleted."
        isPending={deleteOperationMutation.isPending}
        onClose={() => setDeleteOperationConfirmOpen(false)}
        onConfirm={() => { if (selectedOperation) deleteOperationMutation.mutate(selectedOperation.id); }}
      />

      {selectedOperation && (
        <AssignProjectsModal
          open={assignProjectsOpen}
          operation={selectedOperation}
          assignableProjects={(projects ?? []).filter(
            (p) => !operationProjects.some((op) => op.id === p.id) && p.status === "active",
          )}
          onClose={() => setAssignProjectsOpen(false)}
          onAssign={(ids) => bulkAssignMutation.mutate(ids)}
          isPending={bulkAssignMutation.isPending}
        />
      )}

      <InvestigationCreateModal
        open={investigationModalOpen}
        onClose={() => setInvestigationModalOpen(false)}
        initialProjectId={selectedProject?.id ?? null}
        initialOperationId={selectedOperationId}
        initialName={selectedProject?.name ?? selectedOperation?.name ?? ""}
        onCreated={() => { setInvestigationModalOpen(false); navigate("/investigate"); }}
      />
    </div>
  );
}

// ── Project detail pane ────────────────────────────────────────────────────

function ProjectDetailPane({
  project,
  operations,
  projectSignals,
  vaultFiles,
  notesDraft,
  notesStatus,
  editingName,
  nameDraft,
  renamePending,
  deletePending,
  onNotesChange,
  onEditNameStart,
  onNameDraftChange,
  onCommitRename,
  onCancelRename,
  onAddFromSearch,
  onOpenInvestigation,
  onToggleStatus,
  onDeleteClick,
  onSignalRemove,
  onVaultFileDeleted,
  onAssignOperation,
}: {
  project: Project;
  operations: Operation[];
  projectSignals: ProjectSignal[];
  vaultFiles: VaultFile[];
  signalCounts: Record<number, number>;
  notesDraft: string;
  notesStatus: "idle" | "dirty" | "saving" | "saved";
  editingName: boolean;
  nameDraft: string;
  renamePending: boolean;
  deletePending: boolean;
  onNotesChange: (v: string) => void;
  onEditNameStart: () => void;
  onNameDraftChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onAddFromSearch: () => void;
  onOpenInvestigation: () => void;
  onToggleStatus: () => void;
  onDeleteClick: () => void;
  onSignalRemove: (id: number) => void;
  onVaultFileDeleted: () => void;
  onAssignOperation: (operationId: number | null) => void;
}) {
  return (
    <>
      <div className="flex shrink-0 flex-col border-b border-[var(--border)] bg-[var(--base)]">
        {/* Project eyebrow */}
        <div className="flex items-center gap-2 px-5 pt-3">
          <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
            {project.type.replace("_", " ")}
          </span>
          <StatusPill variant={project.status === "active" ? "active" : "paused"}>
            {project.status.toUpperCase()}
          </StatusPill>
        </div>

        {/* Name row + actions */}
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
          <div className="flex min-w-0 items-center">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => onNameDraftChange(e.target.value)}
                onBlur={onCommitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onCommitRename(); }
                  else if (e.key === "Escape") { e.preventDefault(); onCancelRename(); }
                }}
                disabled={renamePending}
                className="min-w-0 flex-1 rounded-sm border border-[var(--accent-border)] bg-[var(--mantle)] px-1.5 py-0.5 font-ui text-[15px] font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
            ) : (
              <button
                type="button"
                onClick={onEditNameStart}
                title="Click to rename"
                className="group/rename flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-[var(--surface-wash)]"
              >
                <span className="min-w-0 truncate font-ui text-[15px] font-semibold text-[var(--text)]">{project.name}</span>
                <Pencil className="h-3 w-3 shrink-0 text-[var(--overlay-1)] opacity-0 transition-opacity group-hover/rename:opacity-100" />
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="accent-outline" className="gap-1.5" onClick={onAddFromSearch}>
              <FolderSearch className="h-3 w-3" />
              Add Search
            </Button>
            <Button size="sm" variant="primary" className="gap-1.5" onClick={onOpenInvestigation}>
              <FileSearch className="h-3 w-3" />
              Run Investigation
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={onToggleStatus}>
              <Archive className="h-3 w-3" />
              {project.status === "active" ? "Archive" : "Reactivate"}
            </Button>
            <Button
              size="sm" variant="ghost" disabled={deletePending}
              onClick={onDeleteClick}
              className="gap-1.5 text-[var(--overlay-1)] hover:text-[var(--danger)]"
            >
              <Trash2 className="h-3 w-3" />
              {deletePending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Operation assignment */}
        {operations.length > 0 && (
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-2.5">
            <span className="shrink-0 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Operation
            </span>
            <select
              className="h-7 min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              value={project.operation_id ?? ""}
              onChange={(e) => onAssignOperation(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Unassigned</option>
              {operations.filter((o) => o.status === "active").map((op) => (
                <option key={op.id} value={op.id}>{op.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Notes</span>
            <span className={cn(
              "font-mono text-[10px] transition-opacity duration-200",
              notesStatus === "saving" ? "text-[var(--overlay-1)] opacity-100"
                : notesStatus === "saved" ? "text-[var(--success)] opacity-100"
                  : notesStatus === "dirty" ? "text-[var(--overlay-1)] opacity-100"
                    : "opacity-0",
            )}>
              {notesStatus === "saving" ? "Saving…" : notesStatus === "saved" ? "Saved" : notesStatus === "dirty" ? "Editing…" : ""}
            </span>
          </div>
          <Textarea
            value={notesDraft}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Scope, hypotheses, analyst notes…"
            className="min-h-[88px]"
          />
        </div>

        {/* Vault files — graph exports first */}
        {vaultFiles.length > 0 && (
          <div className="shrink-0 border-b border-[var(--border)]">
            <div className="px-5 py-3">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Files</span>
            </div>
            <div className="flex flex-col gap-0.5 px-3 pb-3">
              {vaultFiles.map((file) => (
                <VaultFileRow key={file.id} file={file} onDeleted={onVaultFileDeleted} />
              ))}
            </div>
          </div>
        )}

        {/* Signals */}
        <div className="px-5 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Attached signals</span>
            <span className="font-mono text-[10px] text-[var(--overlay-1)]">{projectSignals.length}</span>
          </div>
        </div>
        {projectSignals.length === 0 ? (
          <div className="mx-5 mb-5 rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-4 py-8 text-center font-ui text-[12px] text-[var(--overlay-1)]">
            No saved signals yet. Route from Inbox or Search.
          </div>
        ) : (
          <div className="px-5 pb-5">
            {projectSignals.map((ps) =>
              ps.intel_signals ? (
                <SignalCard
                  key={ps.id}
                  title={ps.intel_signals.title}
                  url={ps.intel_signals.url}
                  source={ps.intel_signals.source}
                  publishedAt={ps.intel_signals.published_at}
                  watchDomain={ps.intel_signals.watch_domain}
                  snippet={ps.intel_signals.snippet}
                  score={ps.intel_signals.exa_score}
                  onDismiss={() => onSignalRemove(ps.id)}
                />
              ) : null,
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Operation detail pane ──────────────────────────────────────────────────

function OperationDetailPane({
  operation,
  operationProjects,
  signalCounts,
  descDraft,
  descStatus,
  editingName,
  nameDraft,
  renamePending,
  deletePending,
  onDescChange,
  onEditNameStart,
  onNameDraftChange,
  onCommitRename,
  onCancelRename,
  onNewProject,
  onNewInvestigation,
  onDeleteClick,
  onSelectProject,
  allProjects,
  onAssignProject,
}: {
  operation: Operation;
  operationProjects: Project[];
  signalCounts: Record<number, number>;
  descDraft: string;
  descStatus: "idle" | "dirty" | "saving" | "saved";
  editingName: boolean;
  nameDraft: string;
  renamePending: boolean;
  deletePending: boolean;
  onDescChange: (v: string) => void;
  onEditNameStart: () => void;
  onNameDraftChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onNewProject: () => void;
  onNewInvestigation: () => void;
  onDeleteClick: () => void;
  onSelectProject: (id: number) => void;
  allProjects: Project[];
  onAssignProject: () => void;
}) {
  const totalSignals = operationProjects.reduce((acc, p) => acc + (signalCounts[p.id] ?? 0), 0);
  const assignableProjects = allProjects.filter(
    (p) => !operationProjects.some((op) => op.id === p.id) && p.status === "active"
  );

  return (
    <>
      <div className="flex shrink-0 flex-col border-b border-[var(--border)] bg-[var(--mantle)]">
        {/* Operation eyebrow */}
        <div className="flex items-center gap-2 px-5 pt-3">
          <Layers aria-hidden strokeWidth={1.5} className="h-3 w-3 shrink-0 text-[var(--accent)]" />
          <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Operation
          </span>
          <StatusPill variant={operation.status === "active" ? "active" : "paused"}>
            {operation.status.toUpperCase()}
          </StatusPill>
        </div>

        {/* Name row + actions */}
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
          <div className="flex min-w-0 items-center">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => onNameDraftChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onCommitRename(); }
                else if (e.key === "Escape") { e.preventDefault(); onCancelRename(); }
              }}
              disabled={renamePending}
              className="min-w-0 flex-1 rounded-sm border border-[var(--accent-border)] bg-[var(--base)] px-1.5 py-0.5 font-ui text-[15px] font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
          ) : (
            <button
              type="button"
              onClick={onEditNameStart}
              title="Click to rename"
              className="group/rename flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-[var(--surface-wash)]"
            >
              <span className="min-w-0 truncate font-ui text-[15px] font-semibold text-[var(--text)]">{operation.name}</span>
              <Pencil className="h-3 w-3 shrink-0 text-[var(--overlay-1)] opacity-0 transition-opacity group-hover/rename:opacity-100" />
            </button>
          )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="primary" className="gap-1.5" onClick={onNewProject}>
              <Plus className="h-3 w-3" />
              Add Project
            </Button>
            <Button size="sm" variant="accent-outline" className="gap-1.5" onClick={onNewInvestigation}>
              <FileSearch className="h-3 w-3" />
              Run Investigation
            </Button>
            <Button
              size="sm" variant="ghost" disabled={deletePending}
              onClick={onDeleteClick}
              className="gap-1.5 text-[var(--overlay-1)] hover:text-[var(--danger)]"
            >
              <Trash2 className="h-3 w-3" />
              {deletePending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Description */}
        <div className="border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Description</span>
            <span className={cn(
              "font-mono text-[10px] transition-opacity duration-200",
              descStatus === "saving" ? "text-[var(--overlay-1)] opacity-100"
                : descStatus === "saved" ? "text-[var(--success)] opacity-100"
                  : descStatus === "dirty" ? "text-[var(--overlay-1)] opacity-100"
                    : "opacity-0",
            )}>
              {descStatus === "saving" ? "Saving…" : descStatus === "saved" ? "Saved" : descStatus === "dirty" ? "Editing…" : ""}
            </span>
          </div>
          <Textarea
            value={descDraft}
            onChange={(e) => onDescChange(e.target.value)}
            placeholder="Scope, objectives, context…"
            className="min-h-[88px]"
          />
        </div>

        {/* Projects summary */}
        <div className="px-5 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Projects</span>
            <span className="font-mono text-[10px] text-[var(--overlay-1)]">{operationProjects.length} projects · {totalSignals} signals</span>
          </div>

          {assignableProjects.length > 0 && (
            <div className="mb-3">
              <Button size="sm" variant="accent-outline" className="gap-1.5 w-full justify-center" onClick={onAssignProject}>
                <Plus className="h-3 w-3" />
                Assign existing project{assignableProjects.length > 1 ? "s" : ""}
              </Button>
            </div>
          )}
          {operationProjects.length === 0 ? (
            <div className="mb-5 rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-4 py-8 text-center font-ui text-[12px] text-[var(--overlay-1)]">
              No projects yet. Add a project to start collecting signals.
            </div>
          ) : (
            <div className="mb-5 flex flex-col gap-1">
              {operationProjects.map((p) => {
                const count = signalCounts[p.id] ?? 0;
                const dot = p.watch_domain ? domainColor(p.watch_domain) : "var(--overlay-1)";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectProject(p.id)}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--surface-wash)]"
                  >
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
                    <span className="min-w-0 flex-1 truncate font-ui text-[13px] text-[var(--text)]">{p.name}</span>
                    <span className="shrink-0 font-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--subtext-0)]">
                      {p.type.replace("_", " ")}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--overlay-1)]">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Delete confirm modal ───────────────────────────────────────────────────

function DeleteConfirmModal({
  open, title, label, description, footnote, isPending, onClose, onConfirm,
}: {
  open: boolean; title: string; label: string; description: string;
  footnote?: string; isPending: boolean; onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">{label}</p>
          <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">{title}</h3>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <p className="font-ui text-[13px] text-[var(--subtext-0)]">{description}</p>
          {footnote && <p className="font-ui text-[12px] text-[var(--overlay-1)]">{footnote}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending} className="gap-1.5">
              <Trash2 className="h-3 w-3" />
              {isPending ? "Deleting…" : label}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
