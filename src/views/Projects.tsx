import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FolderSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { SignalCard } from "@/components/signals/signal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createProject,
  listProjectSignals,
  listProjects,
  removeSignalFromProject,
  updateProject,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import type { Project, ProjectSignal, ProjectType } from "@/lib/types";
import { useAppStore } from "@/store";

export function ProjectsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("research");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const setSearchTargetProjectId = useAppStore((state) => state.setSearchTargetProjectId);

  const { data: projects, error } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    setNotesDraft(selectedProject?.notes ?? "");
  }, [selectedProject]);

  const { data: projectSignals } = useQuery({
    queryKey: ["project-signals", selectedProjectId],
    queryFn: () => listProjectSignals(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const createMutation = useMutation({
    mutationFn: () => createProject({ name, type }),
    onSuccess: async (project) => {
      setName("");
      setType("research");
      setSelectedProjectId(project.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
    },
    onError: (err) => toastError("Couldn't create project", err),
  });

  const saveNotesMutation = useMutation({
    mutationFn: () =>
      updateProject(selectedProjectId as number, {
        notes: notesDraft,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({
        queryKey: ["project-signals", selectedProjectId],
      });
      toast.success("Notes saved");
    },
    onError: (err) => toastError("Couldn't save notes", err),
  });

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
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projects unavailable</CardTitle>
        </CardHeader>
        <CardContent>{error.message}</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <select
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as ProjectType)}
          >
            <option value="report">Report</option>
            <option value="scoping">Scoping</option>
            <option value="research">Research</option>
            <option value="client_case">Client Case</option>
          </select>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            Create project
          </Button>
        </CardContent>

        <CardContent className="grid gap-2 pt-0">
          {(projects ?? []).map((project) => {
            const isSelected = project.id === selectedProjectId;
            return (
              <button
                key={project.id}
                type="button"
                data-selected={isSelected ? "true" : undefined}
                className={cn(
                  "group/project relative overflow-hidden rounded-xl border p-4 text-left",
                  "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isSelected
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)] pl-[calc(1rem-3px)]"
                    : "border-[var(--border)] bg-[var(--surface)]/40 hover:bg-[var(--surface-wash)]",
                )}
                onClick={() => setSelectedProjectId(project.id)}
              >
                {isSelected ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]"
                  />
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      "font-medium",
                      isSelected ? "text-[var(--accent)]" : "text-[var(--foreground)]",
                    )}
                  >
                    {project.name}
                  </p>
                  <Badge variant={project.status === "active" ? "success" : "neutral"}>
                    {project.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
                  {project.type.replace("_", " ")}
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        {selectedProject ? (
          <>
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-2xl">{selectedProject.name}</CardTitle>
                    <Badge variant="accent">
                      {selectedProject.type.replace("_", " ")}
                    </Badge>
                    <Badge variant={selectedProject.status === "active" ? "success" : "neutral"}>
                      {selectedProject.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                    Every saved signal in this project becomes working material for
                    search, graphing, and later report analysis.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchTargetProjectId(selectedProject.id);
                      navigate("/search");
                    }}
                  >
                    <FolderSearch className="h-4 w-4" />
                    Add from Search
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => toggleStatusMutation.mutate()}
                  >
                    <Archive className="h-4 w-4" />
                    {selectedProject.status === "active" ? "Archive" : "Reactivate"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--foreground)]">Notes</p>
                  <Button
                    size="sm"
                    onClick={() => saveNotesMutation.mutate()}
                    disabled={saveNotesMutation.isPending}
                  >
                    Save notes
                  </Button>
                </div>
                <Textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Capture scope, hypotheses, or analyst notes."
                />
              </div>

              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Attached signals
                  </p>
                  <Badge variant="neutral">{projectSignals?.length ?? 0}</Badge>
                </div>
                {(projectSignals ?? []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/40 p-8 text-center text-sm text-[var(--foreground-muted)]">
                    No saved signals yet. Route something in from Inbox or Search.
                  </div>
                ) : (
                  (projectSignals ?? []).map((projectSignal) =>
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
                  )
                )}
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="p-6 text-sm text-[var(--foreground-muted)]">
            Select a project from the list to inspect its saved intelligence.
          </CardContent>
        )}
      </Card>
    </div>
  );
}
