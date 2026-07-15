import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvestigation, listProjects } from "@/lib/data";
import { toastError } from "@/lib/toast";
import type { InvestigationUseCase } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

// operationId is passed from context (e.g. opening from an Operation detail pane)

type InvestigationCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (caseId: string) => void;
  initialProjectId?: number | null;
  initialOperationId?: number | null;
  initialName?: string;
};

const USE_CASES: { id: InvestigationUseCase; label: string; description: string }[] = [
  {
    id: "scoping",
    label: "Scoping",
    description: "Early client recon — intelligence brief with flags and recommendations",
  },
  {
    id: "post",
    label: "Post",
    description: "Public content — GenZen article on trends, groups, or targets",
  },
  {
    id: "sit_rep",
    label: "Sit Rep",
    description: "Legacy Threat Analysis — structured contribution with HUMINT integration",
  },
];

export function InvestigationCreateModal({
  open,
  onClose,
  onCreated,
  initialProjectId = null,
  initialOperationId = null,
  initialName = "",
}: InvestigationCreateModalProps) {
  const queryClient = useQueryClient();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [name, setName] = useState(initialName);
  const [useCase, setUseCase] = useState<InvestigationUseCase>("scoping");
  const [projectId, setProjectId] = useState<number | null>(initialProjectId);
  const operationId = initialOperationId;

  const { data: projects } = useQuery({
    queryKey: ["projects", entityFilter],
    queryFn: () => listProjects({ entity: entityFilter }),
    enabled: open,
  });

  const selectableProjects = (projects ?? []).filter((project) => (
    project.status === "active" || project.id === projectId
  ));
  const linkedProject = selectableProjects.find((project) => project.id === projectId) ?? null;

  const createMutation = useMutation({
    mutationFn: () =>
      createInvestigation({
        name: name.trim(),
        projectId,
        projectRecordId: linkedProject?.record_id ?? null,
        operationId,
        taxonomy: { entity: entityFilter ?? "genzen_solutions" },
        useCase,
      }),
    onSuccess: async (investigation) => {
      await queryClient.invalidateQueries({ queryKey: ["investigations"] });
      setName("");
      setUseCase("scoping");
      setProjectId(null);
      onCreated?.(investigation.case_id);
      onClose();
    },
    onError: (error) => {
      toastError("Couldn't create investigation", error);
    },
  });

  useEffect(() => {
    if (open) {
      setName(initialName);
      setProjectId(initialProjectId);
      setUseCase("scoping");
    }
  }, [open, initialName, initialProjectId, initialOperationId]);

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen && !createMutation.isPending) onClose(); }}
      title="New case investigation"
      description="Set the case purpose and choose the evidence pile the investigation should work from."
      className="w-full max-w-[540px]"
    >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || createMutation.isPending) return;
            createMutation.mutate();
          }}
        >
          <label className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Case name
            </span>
            <Input
              placeholder="e.g. Acme Holdings — succession risk"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Use case
            </span>
            <div className="grid gap-2">
              {USE_CASES.map((uc) => (
                <button
                  key={uc.id}
                  type="button"
                  onClick={() => setUseCase(uc.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    useCase === uc.id
                      ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                      : "border-[var(--border-subtle)] bg-[var(--base)] hover:border-[var(--border)]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors",
                      useCase === uc.id
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--overlay-0)] bg-transparent",
                    )}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block font-ui text-[12.5px] font-medium",
                        useCase === uc.id ? "text-[var(--accent)]" : "text-[var(--text)]",
                      )}
                    >
                      {uc.label}
                    </span>
                    <span className="block text-meta text-[var(--subtext-0)]">
                      {uc.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Evidence pile{" "}
              <span className="font-normal normal-case tracking-normal text-[var(--overlay-1)]">
                (optional)
              </span>
            </span>
            <select
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No evidence pile — Exa collects from seed entities</option>
              {selectableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <p className="font-ui text-[11px] text-[var(--overlay-1)]">
            {linkedProject ? (
              <>
                Linked to{" "}
                <span className="font-medium text-[var(--subtext-0)]">{linkedProject.name}</span>.
                Collect will pull that evidence pile's signals.
              </>
            ) : (
              <>
                No evidence pile. Collect will run Exa searches on your seed entities automatically.
              </>
            )}
          </p>

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="font-ui text-[12px] text-[var(--subtext-0)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create case investigation"}
            </Button>
          </div>
        </form>
    </AppDialog>
  );
}
