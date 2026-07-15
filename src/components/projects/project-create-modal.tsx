import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TaxonomyFields, taxonomyDraftFromMetadata } from "@/components/taxonomy/TaxonomyFields";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject, listOperations } from "@/lib/data";
import { buildTaxonomyMetadata } from "@/lib/taxonomy";
import type { ProjectType } from "@/lib/types";
import { WATCH_DOMAINS } from "@/lib/watch-domains";
import { useAppStore } from "@/store";

type ProjectCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (projectId: number) => void;
  initialOperationId?: number | null;
};

export function ProjectCreateModal({ open, onClose, onCreated, initialOperationId = null }: ProjectCreateModalProps) {
  const queryClient = useQueryClient();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("research");
  const [watchDomain, setWatchDomain] = useState<string>("");
  const [operationId, setOperationId] = useState<number | null>(initialOperationId);
  const [taxonomy, setTaxonomy] = useState(() =>
    taxonomyDraftFromMetadata(null, {
      entity: entityFilter ?? "genzen",
      area: "research_intelligence",
      folder: "",
    }),
  );

  const { data: operations } = useQuery({
    queryKey: ["operations", entityFilter],
    queryFn: () => listOperations({ entity: entityFilter }),
    enabled: open,
  });

  const selectableOperations = (operations ?? []).filter((operation) => (
    operation.status === "active" || operation.id === operationId
  ));

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        name,
        type,
        watch_domain: watchDomain || null,
        operation_id: operationId,
        taxonomy: buildTaxonomyMetadata({
          entity: taxonomy.entity,
          area: taxonomy.area,
          folder: taxonomy.folder || name.trim(),
          objectType: "intellizen_project",
          routingRule: "explicit_intellizen_project_only",
        }),
      }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project-signal-counts"] });
      setName("");
      setType("research");
      setWatchDomain("");
      setOperationId(null);
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen",
        area: "research_intelligence",
        folder: "",
      }));
      onCreated?.(project.id);
      onClose();
    },
  });

  useEffect(() => {
    if (!open) {
      setName("");
      setType("research");
      setWatchDomain("");
      setOperationId(initialOperationId);
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen",
        area: "research_intelligence",
        folder: "",
      }));
    }
  }, [open, initialOperationId]);

  useEffect(() => {
    if (!open || operationId == null) return;
    const operation = (operations ?? []).find((candidate) => candidate.id === operationId);
    if (!operation?.taxonomy) return;
    setTaxonomy(taxonomyDraftFromMetadata(operation.taxonomy));
  }, [open, operationId, operations]);

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen && !createMutation.isPending) onClose(); }}
      title="New evidence pile"
      description="Keep related signals, files, and graph material together inside a work item."
      className="w-full max-w-[480px]"
    >
        <form
          className="grid gap-3"
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
              placeholder="Evidence pile name"
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

          {selectableOperations.length > 0 && (
            <label className="grid gap-1.5">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Work item{" "}
                <span className="font-normal normal-case tracking-normal text-[var(--overlay-1)]">
                  (optional)
                </span>
              </span>
              <select
                className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                value={operationId ?? ""}
                onChange={(e) => setOperationId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">No work item — standalone evidence pile</option>
                {selectableOperations.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <TaxonomyFields value={taxonomy} onChange={setTaxonomy} />

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
              {createMutation.isPending ? "Creating…" : "Create evidence pile"}
            </Button>
          </div>
        </form>
    </AppDialog>
  );
}
