import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Operation, Project } from "@/lib/types";

type AssignProjectsModalProps = {
  open: boolean;
  operation: Operation;
  assignableProjects: Project[];
  onClose: () => void;
  onAssign: (projectIds: number[]) => void;
  isPending?: boolean;
};

export function AssignProjectsModal({
  open,
  operation,
  assignableProjects,
  onClose,
  onAssign,
  isPending = false,
}: AssignProjectsModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) { setQuery(""); setSelected(new Set()); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assignableProjects;
    return assignableProjects.filter((p) => p.name.toLowerCase().includes(q));
  }, [assignableProjects, query]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  const allChecked = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someChecked = filtered.some((p) => selected.has(p.id));

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen && !isPending) onClose(); }}
      title="Assign evidence piles"
      description={`Choose the existing evidence that belongs inside ${operation.name}.`}
      className="w-full max-w-[480px]"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            type="button"
            disabled={selected.size === 0 || isPending}
            onClick={() => onAssign(Array.from(selected))}
          >
            {isPending
              ? "Assigning…"
              : selected.size === 0
                ? "Assign evidence piles"
                : `Assign ${selected.size} evidence pile${selected.size === 1 ? "" : "s"}`}
          </Button>
        </>
      )}
    >
      <div className="-mx-5 -my-4">
        {/* Search */}
        <div className="border-b border-[var(--border-subtle)] px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--base)] px-3 py-1.5 focus-within:border-[var(--accent)]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
            <input
              autoFocus
              type="text"
              placeholder="Filter evidence piles…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-ui text-[12px] text-[var(--text)] placeholder:text-[var(--overlay-1)] focus:outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex max-h-[320px] flex-col overflow-y-auto">
          {assignableProjects.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-5 py-10 text-center">
              <p className="font-ui text-[13px] text-[var(--subtext-0)]">All evidence piles already assigned</p>
              <p className="font-ui text-[11px] text-[var(--overlay-1)]">Create a new evidence pile from the work-item pane.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8 text-center font-ui text-[12px] text-[var(--overlay-1)]">
              No evidence piles match "{query}"
            </div>
          ) : (
            <>
              {/* Select all row */}
              <button
                type="button"
                onClick={toggleAll}
                className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-wash)]"
              >
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  allChecked
                    ? "border-[var(--accent)] bg-[var(--accent)]"
                    : someChecked
                      ? "border-[var(--accent)] bg-[var(--accent)]/30"
                      : "border-[var(--overlay-0)] bg-transparent",
                )}>
                  {(allChecked || someChecked) && (
                    <span className="block h-[2px] w-2 rounded-full bg-[var(--crust)]" />
                  )}
                </span>
                <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  {allChecked ? "Deselect all" : "Select all"}
                </span>
                <span className="ml-auto font-mono text-[10px] text-[var(--overlay-1)]">
                  {filtered.length}
                </span>
              </button>

              {filtered.map((project) => {
                const isChecked = selected.has(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => toggle(project.id)}
                    className={cn(
                      "flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 text-left transition-colors",
                      isChecked ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-wash)]",
                    )}
                  >
                    <span className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      isChecked
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--overlay-0)] bg-transparent",
                    )}>
                      {isChecked && (
                        <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-[var(--crust)] stroke-2">
                          <polyline points="1,4 4,7 9,1" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn(
                        "block truncate font-ui text-[13px]",
                        isChecked ? "font-medium text-[var(--accent)]" : "text-[var(--text)]",
                      )}>
                        {project.name}
                      </span>
                      <span className="block font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--subtext-0)]">
                        {project.type.replace("_", " ")}
                        {project.operation_id ? " · reassigning" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

      </div>
    </AppDialog>
  );
}
