import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";

import { TaxonomyFields, taxonomyDraftFromMetadata } from "@/components/taxonomy/TaxonomyFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject, listProjects } from "@/lib/data";
import { buildTaxonomyMetadata } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import type { ProjectType } from "@/lib/types";
import { WATCH_DOMAINS } from "@/lib/watch-domains";
import { useAppStore } from "@/store";

type ProjectPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (projectId: number) => Promise<void> | void;
  title?: string;
  detailsSlot?: ReactNode;
};

export function ProjectPickerModal({
  open,
  onClose,
  onSelect,
  title = "Attach to collection",
  detailsSlot,
}: ProjectPickerModalProps) {
  const queryClient = useQueryClient();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("research");
  const [watchDomain, setWatchDomain] = useState<string>("");
  const [taxonomy, setTaxonomy] = useState(() =>
    taxonomyDraftFromMetadata(null, {
      entity: entityFilter ?? "genzen",
      area: "research_intelligence",
      folder: "",
    }),
  );
  const [creating, setCreating] = useState(false);
  const [savingProjectId, setSavingProjectId] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects", entityFilter],
    queryFn: () => listProjects({ entity: entityFilter }),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        name,
        type,
        watch_domain: watchDomain || null,
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
      setName("");
      setType("research");
      setWatchDomain("");
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen",
        area: "research_intelligence",
        folder: "",
      }));
      setCreating(false);
      await onSelect(project.id);
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
    if (!open) {
      setCreating(false);
      setName("");
      setType("research");
      setWatchDomain("");
      setTaxonomy(taxonomyDraftFromMetadata(null, {
        entity: entityFilter ?? "genzen",
        area: "research_intelligence",
        folder: "",
      }));
      setSavingProjectId(null);
    }
  }, [open]);

  if (!open) return null;

  const existing = projects ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[min(640px,90vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
              {savingProjectId !== null ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />
                  <span className="text-[var(--accent)]">Saving to collection…</span>
                </>
              ) : (
                "Collection routing"
              )}
            </p>
            <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingProjectId !== null}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {detailsSlot ? (
            <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--base)] p-3">
              {detailsSlot}
            </div>
          ) : null}

          <div className="mb-2 flex items-center justify-between">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Existing collections
            </span>
            <span className="font-mono text-[10px] text-[var(--overlay-1)]">
              {existing.length}
            </span>
          </div>

          {existing.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-3 py-4 text-center font-ui text-[12px] text-[var(--overlay-1)]">
              No collections yet — create one below.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {existing.map((project) => {
                const isSaving = savingProjectId === project.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    disabled={savingProjectId !== null}
                    onClick={async () => {
                      setSavingProjectId(project.id);
                      try {
                        await onSelect(project.id);
                        onClose();
                      } catch {
                        setSavingProjectId(null);
                      }
                    }}
                    className={cn(
                      "group flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                      isSaving
                        ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--base)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-wash)]",
                      savingProjectId !== null && !isSaving && "opacity-40",
                    )}
                  >
                    <span className={cn(
                      "truncate font-ui text-[13px] font-medium",
                      isSaving ? "text-[var(--accent)]" : "text-[var(--text)]",
                    )}>
                      {project.name}
                    </span>
                    <span className="shrink-0 flex items-center gap-1.5">
                      {isSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                      ) : (
                        <span className="font-ui text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)] group-hover:text-[var(--subtext-0)]">
                          {project.type.replace("_", " ")}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-5 border-t border-[var(--border)] pt-4">
            {creating ? (
              <div className="grid gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    New collection
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="font-ui text-[11px] text-[var(--overlay-1)] hover:text-[var(--text)]"
                  >
                    Cancel
                  </button>
                </div>
                <Input
                  placeholder="Collection name"
                  value={name}
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
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
                </div>
                <TaxonomyFields value={taxonomy} onChange={setTaxonomy} />
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!name.trim() || createMutation.isPending}
                  className="mt-1"
                >
                  {createMutation.isPending ? "Creating…" : "Create and attach"}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={cn(
                  "w-full rounded-md border border-dashed border-[var(--border)] px-3 py-2.5",
                  "font-ui text-[12px] font-medium text-[var(--subtext-0)]",
                  "transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                )}
              >
                + New collection
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
