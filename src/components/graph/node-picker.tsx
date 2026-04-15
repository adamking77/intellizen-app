import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GraphEntityType } from "@/lib/types";

type NodeOption = {
  node_id: string;
  label: string;
  entity_type: GraphEntityType;
};

type NodePickerProps = {
  nodes: NodeOption[];
  value: string | null;
  onChange: (nodeId: string | null) => void;
  placeholder?: string;
  entityAccent: Record<GraphEntityType, string>;
};

export function NodePicker({
  nodes,
  value,
  onChange,
  placeholder = "Select…",
  entityAccent,
}: NodePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => nodes.find((node) => node.node_id === value) ?? null,
    [nodes, value],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return nodes.slice(0, 80);
    return nodes
      .filter((node) => node.label.toLowerCase().includes(needle))
      .slice(0, 80);
  }, [nodes, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 text-left",
          "transition-colors duration-150 hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none",
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: entityAccent[selected.entity_type] }}
            />
            <span className="text-ui truncate">{selected.label}</span>
          </span>
        ) : (
          <span className="text-meta truncate">{placeholder}</span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3 w-3 text-[var(--overlay-1)] transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]">
          <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-2 py-1.5">
            <Search className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              className="text-ui w-full bg-transparent outline-none placeholder:text-[var(--overlay-1)]"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-meta px-3 py-2">No matches.</p>
            ) : (
              filtered.map((node) => {
                const isSelected = node.node_id === value;
                return (
                  <button
                    key={node.node_id}
                    type="button"
                    onClick={() => {
                      onChange(node.node_id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors duration-150",
                      isSelected
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: entityAccent[node.entity_type] }}
                    />
                    <span className="text-ui truncate">{node.label}</span>
                  </button>
                );
              })
            )}
          </div>
          {nodes.length > 80 && !query && (
            <div className="border-t border-[var(--border)] px-2 py-1.5">
              <p className="text-meta">
                Showing first 80 of {nodes.length}. Type to narrow.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
