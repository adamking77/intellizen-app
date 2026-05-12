import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvestigation, listProjects } from "@/lib/data";
import { toastError } from "@/lib/toast";
import type { InvestigationUseCase } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const [name, setName] = useState(initialName);
  const [useCase, setUseCase] = useState<InvestigationUseCase>("scoping");
  const [projectId, setProjectId] = useState<number | null>(initialProjectId);
  const operationId = initialOperationId;

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
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
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setProjectId(initialProjectId);
      setUseCase("scoping");
    }
  }, [open, initialName, initialProjectId, initialOperationId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New investigation"
        className="flex w-full max-w-[540px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
              Investigate
            </p>
            <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">
              New investigation
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="grid gap-4 px-5 py-4"
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
              Parent project{" "}
              <span className="font-normal normal-case tracking-normal text-[var(--overlay-1)]">
                (optional)
              </span>
            </span>
            <select
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No parent project — Exa collects from seed entities</option>
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
                Collect will pull that project's signals.
              </>
            ) : (
              <>
                No project — Collect will run Exa searches on your seed entities automatically.
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
              {createMutation.isPending ? "Creating…" : "Create investigation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
