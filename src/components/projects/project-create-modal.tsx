import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject, listOperations } from "@/lib/data";
import type { ProjectType } from "@/lib/types";
import { WATCH_DOMAINS } from "@/lib/watch-domains";

type ProjectCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (projectId: number) => void;
  initialOperationId?: number | null;
};

export function ProjectCreateModal({ open, onClose, onCreated, initialOperationId = null }: ProjectCreateModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("research");
  const [watchDomain, setWatchDomain] = useState<string>("");
  const [operationId, setOperationId] = useState<number | null>(initialOperationId);

  const { data: operations } = useQuery({
    queryKey: ["operations"],
    queryFn: listOperations,
    enabled: open,
  });

  const activeOperations = (operations ?? []).filter((o) => o.status === "active");

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        name,
        type,
        watch_domain: watchDomain || null,
        operation_id: operationId,
      }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project-signal-counts"] });
      setName("");
      setType("research");
      setWatchDomain("");
      setOperationId(null);
      onCreated?.(project.id);
      onClose();
    },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setName("");
      setType("research");
      setWatchDomain("");
      setOperationId(initialOperationId);
    }
  }, [open, initialOperationId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
              Projects
            </p>
            <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">
              New project
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
          className="grid gap-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || createMutation.isPending) return;
            createMutation.mutate();
          }}
        >
          <label className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Name
            </span>
            <Input
              placeholder="Project name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1.5">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Type
              </span>
              <select
                className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                value={type}
                onChange={(event) => setType(event.target.value as ProjectType)}
              >
                <option value="report">Report</option>
                <option value="scoping">Scoping</option>
                <option value="research">Research</option>
                <option value="client_case">Client Case</option>
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Watch domain
              </span>
              <select
                className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
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
            </label>
          </div>

          {activeOperations.length > 0 && (
            <label className="grid gap-1.5">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Operation{" "}
                <span className="font-normal normal-case tracking-normal text-[var(--overlay-1)]">
                  (optional)
                </span>
              </span>
              <select
                className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                value={operationId ?? ""}
                onChange={(e) => setOperationId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">No operation — standalone project</option>
                {activeOperations.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="font-ui text-[12px] text-[var(--subtext-0)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
