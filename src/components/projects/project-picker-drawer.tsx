import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createProject, listProjects } from "@/lib/data";
import type { ProjectType } from "@/lib/types";
import { WATCH_DOMAINS } from "@/lib/watch-domains";

type ProjectPickerDrawerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (projectId: number) => Promise<void> | void;
  title?: string;
};

export function ProjectPickerDrawer({
  open,
  onClose,
  onSelect,
  title = "Attach to project",
}: ProjectPickerDrawerProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("research");
  const [watchDomain, setWatchDomain] = useState<string>("");

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        name,
        type,
        watch_domain: watchDomain || null,
      }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setName("");
      setType("research");
      setWatchDomain("");
      await onSelect(project.id);
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(3,7,8,0.72)] backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col gap-4 border-l border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
              Project routing
            </p>
            <h3 className="mt-2 font-serif text-2xl">{title}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--foreground)]">Create new project</p>
          <div className="mt-4 grid gap-3">
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
            <select
              className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
              value={watchDomain}
              onChange={(event) => setWatchDomain(event.target.value)}
            >
              <option value="">No watch domain</option>
              {WATCH_DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create and attach"}
            </Button>
          </div>
        </Card>

        <div className="flex-1 overflow-y-auto">
          <p className="mb-3 text-sm font-medium text-[var(--foreground)]">
            Existing projects
          </p>
          <div className="grid gap-3">
            {(projects ?? []).map((project) => (
              <button
                key={project.id}
                type="button"
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-strong)]"
                onClick={async () => {
                  await onSelect(project.id);
                  onClose();
                }}
              >
                <p className="font-medium text-[var(--foreground)]">{project.name}</p>
                <p className="mt-1 text-sm uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  {project.type.replace("_", " ")}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
