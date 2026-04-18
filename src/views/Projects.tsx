import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileSearch, FolderSearch, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { InvestigationCreateModal } from "@/components/investigations/investigation-create-modal";
import { ProjectCreateModal } from "@/components/projects/project-create-modal";
import { SignalCard } from "@/components/signals/signal-card";
import { Button } from "@/components/ui/button";
import { IndicatorStrip, type IndicatorItem } from "@/components/ui/indicator-strip";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { domainColor } from "@/lib/domains";
import { cn } from "@/lib/utils";
import {
  deleteProject,
  listProjectSignalCounts,
  listProjectSignals,
  listProjects,
  removeSignalFromProject,
  updateProject,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import type { Project, ProjectSignal } from "@/lib/types";
import { useAppStore } from "@/store";

type StatusFilter = "all" | "active" | "archived";

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

export function ProjectsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSearchTargetProjectId = useAppStore((state) => state.setSearchTargetProjectId);
  const pendingProjectSelectionId = useAppStore((state) => state.pendingProjectSelectionId);
  const setPendingProjectSelectionId = useAppStore((state) => state.setPendingProjectSelectionId);

  const [createOpen, setCreateOpen] = useState(false);
  const [investigationModalOpen, setInvestigationModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesStatus, setNotesStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

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

  useEffect(() => {
    if (pendingProjectSelectionId == null) return;
    const target = (projects ?? []).find((p) => p.id === pendingProjectSelectionId);
    if (!target) return;
    if (target.status !== statusFilter && statusFilter !== "all") {
      setStatusFilter("all");
    }
    setSelectedProjectId(target.id);
    setPendingProjectSelectionId(null);
  }, [pendingProjectSelectionId, projects, statusFilter, setPendingProjectSelectionId]);

  useEffect(() => {
    if (selectedProjectId == null && filtered.length > 0) {
      setSelectedProjectId(filtered[0].id);
      return;
    }
    if (selectedProjectId != null && !filtered.some((p) => p.id === selectedProjectId) && filtered.length > 0) {
      setSelectedProjectId(filtered[0].id);
    }
  }, [filtered, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    setNotesDraft(selectedProject?.notes ?? "");
    setNotesStatus("idle");
    setNameDraft(selectedProject?.name ?? "");
    setEditingName(false);
  }, [selectedProject?.id]);

  const { data: projectSignals } = useQuery({
    queryKey: ["project-signals", selectedProjectId],
    queryFn: () => listProjectSignals(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const stats = useMemo(() => {
    const list = projects ?? [];
    const active = list.filter((p) => p.status === "active").length;
    const archived = list.filter((p) => p.status === "archived").length;
    const lastUpdated = list
      .map((p) => p.updated_at)
      .filter(Boolean)
      .sort()
      .pop();
    const totalSignals = Object.values(signalCounts ?? {}).reduce((a, b) => a + b, 0);
    return { active, archived, lastUpdated, totalSignals, total: list.length };
  }, [projects, signalCounts]);

  const saveNotesMutation = useMutation({
    mutationFn: (value: string) =>
      updateProject(selectedProjectId as number, { notes: value }),
    onMutate: () => {
      setNotesStatus("saving");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNotesStatus("saved");
    },
    onError: (err) => {
      setNotesStatus("dirty");
      toastError("Couldn't save notes", err);
    },
  });

  // Auto-save notes with debounce when dirty
  useEffect(() => {
    if (notesStatus !== "dirty" || selectedProjectId == null) return;
    const handle = window.setTimeout(() => {
      saveNotesMutation.mutate(notesDraft);
    }, 700);
    return () => window.clearTimeout(handle);
  }, [notesDraft, notesStatus, selectedProjectId]);

  // Fade "saved" indicator after a moment
  useEffect(() => {
    if (notesStatus !== "saved") return;
    const handle = window.setTimeout(() => setNotesStatus("idle"), 1800);
    return () => window.clearTimeout(handle);
  }, [notesStatus]);

  const toggleStatusMutation = useMutation({
    mutationFn: () =>
      updateProject(selectedProjectId as number, {
        status: selectedProject?.status === "active" ? "archived" : "active",
      }),
    onMutate: async () => {
      if (selectedProjectId === null) return;
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      const previous = queryClient.getQueryData<Project[]>(["projects"]);
      const nextStatus = selectedProject?.status === "active" ? "archived" : "active";
      queryClient.setQueryData<Project[]>(["projects"], (old) =>
        (old ?? []).map((p) =>
          p.id === selectedProjectId ? { ...p, status: nextStatus } : p,
        ),
      );
      return { previous, nextStatus };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["projects"], context.previous);
      }
      toastError("Couldn't update project", err);
    },
    onSuccess: (_, __, context) => {
      toast.success(context?.nextStatus === "archived" ? "Project archived" : "Project reactivated");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateProject(selectedProjectId as number, { name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditingName(false);
      toast.success("Project renamed");
    },
    onError: (err) => toastError("Couldn't rename project", err),
  });

  function commitRename() {
    const trimmed = nameDraft.trim();
    if (!selectedProject) {
      setEditingName(false);
      return;
    }
    if (!trimmed || trimmed === selectedProject.name) {
      setEditingName(false);
      setNameDraft(selectedProject.name);
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
      if (context?.previous) {
        queryClient.setQueryData(["project-signals", selectedProjectId], context.previous);
      }
      toastError("Couldn't remove signal", err);
    },
    onSuccess: () => toast.success("Signal removed"),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project-signals", selectedProjectId],
      });
      void queryClient.invalidateQueries({ queryKey: ["project-signal-counts"] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: async () => {
      setSelectedProjectId(null);
      setDeleteConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project-signal-counts"] });
      toast.success("Project deleted");
    },
    onError: (err) => toastError("Couldn't delete project", err),
  });

  const indicators: IndicatorItem[] = [
    {
      label: "Total",
      value: stats.total,
      onClick: () => setStatusFilter("all"),
      active: statusFilter === "all",
    },
    {
      label: "Active",
      value: stats.active,
      status: stats.active > 0 ? "active" : "neutral",
      onClick: () => setStatusFilter("active"),
      active: statusFilter === "active",
    },
    {
      label: "Archived",
      value: stats.archived,
      status: stats.archived > 0 ? "warning" : "neutral",
      onClick: () => setStatusFilter("archived"),
      active: statusFilter === "archived",
    },
    { label: "Last touch", value: formatElapsed(stats.lastUpdated) },
  ];

  if (error) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Projects unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Topbar: IndicatorStrip + status tabs + New project */}
      <div className="flex shrink-0 items-start justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Projects</span>
          <IndicatorStrip items={indicators} />
        </div>

        <div className="flex items-center pt-1">
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3 w-3" />
            New project
          </Button>
        </div>
      </div>

      {/* Content: project rail + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Project list rail */}
        <aside
          style={{ width: railWidth }}
          className="relative flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--base)]"
        >
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <p className="text-label">
                  {statusFilter !== "all" ? `No ${statusFilter} projects` : "No projects"}
                </p>
                <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                  {statusFilter !== "all"
                    ? "Switch the status tab to see others."
                    : "Create your first project to collect signals."}
                </p>
                {statusFilter === "all" ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
                    <Plus className="h-3 w-3" />
                    New project
                  </Button>
                ) : null}
              </div>
            ) : (
              filtered.map((project) => {
                const isSelected = project.id === selectedProjectId;
                const count = signalCounts?.[project.id] ?? 0;
                const domain = project.watch_domain;
                const dot = domain ? domainColor(domain) : "var(--overlay-1)";
                return (
                  <button
                    key={project.id}
                    type="button"
                    data-selected={isSelected ? "true" : undefined}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={cn(
                      "group/row relative flex w-full cursor-pointer items-start gap-3 border-b border-[var(--border-subtle)] py-3 pr-3 text-left",
                      "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      isSelected
                        ? "bg-[var(--accent-soft)] pl-[13px]"
                        : "pl-4 hover:bg-[var(--surface-wash)]",
                      project.status === "archived" && "opacity-50",
                    )}
                  >
                    {isSelected ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]"
                      />
                    ) : null}

                    <span
                      aria-hidden
                      className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: dot }}
                    />

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate font-ui text-[13px] font-medium",
                            isSelected
                              ? "text-[var(--accent)]"
                              : "text-[var(--text)] group-hover/row:text-[var(--text)]",
                          )}
                        >
                          {project.name}
                        </p>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--overlay-1)]">
                          {count}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 text-[11px]">
                        <span
                          className="font-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--subtext-0)]"
                        >
                          {project.type.replace("_", " ")}
                        </span>
                        {project.status === "archived" ? (
                          <>
                            <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                            <span className="font-ui text-[10px] uppercase tracking-[0.08em] text-[var(--warning)]">
                              Archived
                            </span>
                          </>
                        ) : null}
                        {domain ? (
                          <>
                            <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                            <span className="min-w-0 truncate font-mono text-[11px] text-[var(--overlay-1)]">
                              {domain}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Resize handle on right edge of rail */}
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
            <>
              {/* Sub-topbar: project chrome */}
              <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-5">
                <div className="flex min-w-0 items-center gap-2">
                  {editingName ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setNameDraft(selectedProject.name);
                          setEditingName(false);
                        }
                      }}
                      disabled={renameMutation.isPending}
                      className="min-w-0 flex-1 rounded-sm border border-[var(--accent-border)] bg-[var(--mantle)] px-1.5 py-0.5 font-ui text-[14px] font-medium text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNameDraft(selectedProject.name);
                        setEditingName(true);
                      }}
                      title="Click to rename"
                      className="group/rename min-w-0 truncate rounded-sm px-1 py-0.5 text-left font-ui text-[14px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-wash)]"
                    >
                      {selectedProject.name}
                    </button>
                  )}
                  <span className="shrink-0 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--subtext-0)]">
                    {selectedProject.type.replace("_", " ")}
                  </span>
                  <StatusPill
                    variant={selectedProject.status === "active" ? "active" : "paused"}
                  >
                    {selectedProject.status.toUpperCase()}
                  </StatusPill>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => {
                      setSearchTargetProjectId(selectedProject.id);
                      navigate("/search");
                    }}
                  >
                    <FolderSearch className="h-3 w-3" />
                    Add from Search
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => setInvestigationModalOpen(true)}
                  >
                    <FileSearch className="h-3 w-3" />
                    Open as investigation
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    onClick={() => toggleStatusMutation.mutate()}
                  >
                    <Archive className="h-3 w-3" />
                    {selectedProject.status === "active" ? "Archive" : "Reactivate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleteProjectMutation.isPending}
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="gap-1.5 text-[var(--overlay-1)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-3 w-3" />
                    {deleteProjectMutation.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Notes */}
                <div className="border-b border-[var(--border-subtle)] px-5 py-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Notes
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[10px] transition-opacity duration-200",
                        notesStatus === "saving"
                          ? "text-[var(--overlay-1)] opacity-100"
                          : notesStatus === "saved"
                            ? "text-[var(--success)] opacity-100"
                            : notesStatus === "dirty"
                              ? "text-[var(--overlay-1)] opacity-100"
                              : "opacity-0",
                      )}
                    >
                      {notesStatus === "saving"
                        ? "Saving…"
                        : notesStatus === "saved"
                          ? "Saved"
                          : notesStatus === "dirty"
                            ? "Editing…"
                            : ""}
                    </span>
                  </div>
                  <Textarea
                    value={notesDraft}
                    onChange={(event) => {
                      setNotesDraft(event.target.value);
                      setNotesStatus("dirty");
                    }}
                    placeholder="Scope, hypotheses, analyst notes…"
                    className="min-h-[88px]"
                  />
                </div>

                {/* Attached signals */}
                <div className="px-5 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Attached signals
                    </span>
                    <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                      {projectSignals?.length ?? 0}
                    </span>
                  </div>
                </div>
                {(projectSignals ?? []).length === 0 ? (
                  <div className="mx-5 mb-5 rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-4 py-8 text-center font-ui text-[12px] text-[var(--overlay-1)]">
                    No saved signals yet. Route from Inbox or Search.
                  </div>
                ) : (
                  <div className="px-5 pb-5">
                    {(projectSignals ?? []).map((projectSignal) =>
                      projectSignal.intel_signals ? (
                        <SignalCard
                          key={projectSignal.id}
                          title={projectSignal.intel_signals.title}
                          url={projectSignal.intel_signals.url}
                          source={projectSignal.intel_signals.source}
                          publishedAt={projectSignal.intel_signals.published_at}
                          watchDomain={projectSignal.intel_signals.watch_domain}
                          snippet={projectSignal.intel_signals.snippet}
                          score={projectSignal.intel_signals.exa_score}
                          onDismiss={() => removeSignalMutation.mutate(projectSignal.id)}
                        />
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
              <p className="text-label">Select a project</p>
              <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                Pick one from the list to inspect notes and attached signals.
              </p>
            </div>
          )}
        </section>
      </div>

      <ProjectCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => setSelectedProjectId(id)}
      />

      <DeleteProjectModal
        open={deleteConfirmOpen && !!selectedProject}
        projectName={selectedProject?.name ?? ""}
        isPending={deleteProjectMutation.isPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (!selectedProject) return;
          deleteProjectMutation.mutate(selectedProject.id);
        }}
      />

      <InvestigationCreateModal
        open={investigationModalOpen}
        onClose={() => setInvestigationModalOpen(false)}
        initialProjectId={selectedProject?.id ?? null}
        initialName={selectedProject?.name ?? ""}
        onCreated={() => {
          setInvestigationModalOpen(false);
          navigate("/investigate");
        }}
      />
    </div>
  );
}

function DeleteProjectModal({
  open, projectName, isPending, onClose, onConfirm,
}: {
  open: boolean; projectName: string; isPending: boolean;
  onClose: () => void; onConfirm: () => void;
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
        aria-label="Delete project"
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">Delete project</p>
          <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">{projectName}</h3>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <p className="font-ui text-[13px] text-[var(--subtext-0)]">
            Removes the project and its signal associations permanently.
          </p>
          <p className="font-ui text-[12px] text-[var(--overlay-1)]">Source signals are not deleted — they stay in Inbox.</p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending} className="gap-1.5">
              <Trash2 className="h-3 w-3" />
              {isPending ? "Deleting…" : "Delete project"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
