import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaxonomyFields, taxonomyDraftFromMetadata } from "@/components/taxonomy/TaxonomyFields";
import { Textarea } from "@/components/ui/textarea";
import { createOperation } from "@/lib/data";
import { INTEL_WORK_TYPES, withIntelWorkType, type IntelWorkType } from "@/lib/intel-work-items";
import { buildTaxonomyMetadata } from "@/lib/taxonomy";
import { toastError } from "@/lib/toast";
import { useAppStore } from "@/store";

type OperationCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (operationId: number) => void;
};

export function OperationCreateModal({ open, onClose, onCreated }: OperationCreateModalProps) {
  const queryClient = useQueryClient();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workType, setWorkType] = useState<IntelWorkType>("client_case");
  const [taxonomy, setTaxonomy] = useState(() =>
    taxonomyDraftFromMetadata(null, {
      entity: entityFilter ?? "genzen_solutions",
      area: "research_intelligence",
      folder: "",
    }),
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createOperation({
        name: name.trim(),
        description: description.trim() || null,
        taxonomy: withIntelWorkType(
          buildTaxonomyMetadata({
            entity: taxonomy.entity,
            area: taxonomy.area,
            folder: taxonomy.folder || name.trim(),
            objectType: "operation",
          }),
          workType,
        ),
      }),
    onSuccess: async (operation) => {
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      setName("");
      setDescription("");
      setWorkType("client_case");
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen_solutions",
        area: "research_intelligence",
        folder: "",
      }));
      onCreated?.(operation.id);
      onClose();
    },
    onError: (err) => toastError("Couldn't create work item", err),
  });

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setWorkType("client_case");
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen_solutions",
        area: "research_intelligence",
        folder: "",
      }));
    }
  }, [open]);

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen && !createMutation.isPending) onClose(); }}
      title="New work item"
      description="Choose the kind of research first. Client cases alone use the four-stage case workflow."
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
              placeholder="e.g. Shadow Lotus"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Work type
            </span>
            <select
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              value={workType}
              onChange={(event) => setWorkType(event.target.value as IntelWorkType)}
            >
              {INTEL_WORK_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="font-ui text-[11px] text-[var(--overlay-1)]">
              {INTEL_WORK_TYPES.find((option) => option.value === workType)?.description}
            </span>
          </label>

          <TaxonomyFields value={taxonomy} onChange={setTaxonomy} />

          <label className="grid gap-1.5">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Description{" "}
              <span className="font-normal normal-case tracking-normal text-[var(--overlay-1)]">
                (optional)
              </span>
            </span>
            <Textarea
              placeholder="Scope, objectives, context…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[72px]"
            />
          </label>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="font-ui text-[12px] text-[var(--subtext-0)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create work item"}
            </Button>
          </div>
        </form>
    </AppDialog>
  );
}
