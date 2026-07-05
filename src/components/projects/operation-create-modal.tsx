import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaxonomyFields, taxonomyDraftFromMetadata } from "@/components/taxonomy/TaxonomyFields";
import { Textarea } from "@/components/ui/textarea";
import { createOperation } from "@/lib/data";
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
        taxonomy: buildTaxonomyMetadata({
          entity: taxonomy.entity,
          area: taxonomy.area,
          folder: taxonomy.folder || name.trim(),
          objectType: "operation",
        }),
      }),
    onSuccess: async (operation) => {
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      setName("");
      setDescription("");
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen_solutions",
        area: "research_intelligence",
        folder: "",
      }));
      onCreated?.(operation.id);
      onClose();
    },
    onError: (err) => toastError("Couldn't create operation", err),
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
      setDescription("");
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen_solutions",
        area: "research_intelligence",
        folder: "",
      }));
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New operation"
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
              Operations
            </p>
            <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">
              New operation
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
              placeholder="e.g. Shadow Lotus"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
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
              {createMutation.isPending ? "Creating…" : "Create operation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
