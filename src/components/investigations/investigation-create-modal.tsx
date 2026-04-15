import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInvestigation, listProjects } from "@/lib/data";

type InvestigationCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (caseId: string) => void;
  initialProjectId?: number | null;
  initialName?: string;
};

export function InvestigationCreateModal({
  open,
  onClose,
  onCreated,
  initialProjectId = null,
  initialName = "",
}: InvestigationCreateModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState("");
  const [projectId, setProjectId] = useState<number | null>(initialProjectId);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    enabled: open,
  });

  const activeProjects = (projects ?? []).filter((p) => p.status === "active");
  const linkedProject = activeProjects.find((p) => p.id === projectId) ?? null;

  const createMutation = useMutation({
    mutationFn: () => createInvestigation({ name: name.trim(), projectId }),
    onSuccess: async (investigation) => {
      await queryClient.invalidateQueries({ queryKey: ["investigations"] });
      setName("");
      setSubject("");
      setProjectId(null);
      onCreated?.(investigation.case_id);
      onClose();
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
      setSubject("");
    }
  }, [open, initialName, initialProjectId]);

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
        className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
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
          className="grid gap-3 px-5 py-4"
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
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Parent project{" "}
              <span className="font-normal normal-case tracking-normal text-[var(--overlay-1)]">
                (optional — inherits that project's signals at Collect)
              </span>
            </span>
            <select
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              value={projectId ?? ""}
              onChange={(event) =>
                setProjectId(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">No parent project</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              One-line subject{" "}
              <span className="font-normal normal-case tracking-normal text-[var(--overlay-1)]">
                (optional — you'll flesh this out in Phase 1)
              </span>
            </span>
            <Textarea
              rows={2}
              placeholder="Who or what is being investigated?"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>

          <p className="font-ui text-[11px] text-[var(--overlay-1)]">
            {linkedProject ? (
              <>
                Linked to{" "}
                <span className="font-medium text-[var(--subtext-0)]">{linkedProject.name}</span>.
                The Collect phase will pull attached signals from that project.
              </>
            ) : (
              <>
                A new case folder will be created at{" "}
                <span className="font-mono text-[10px] text-[var(--subtext-0)]">
                  ~/vault/intelligence/investigations/&lt;case-id&gt;/
                </span>
              </>
            )}
          </p>

          <div className="mt-2 flex items-center justify-end gap-2">
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
