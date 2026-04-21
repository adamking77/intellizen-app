import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export interface RecordPickerOption {
  id: string;
  label: string;
  meta?: string;
}

interface RecordPickerDropdownProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  options: RecordPickerOption[];
  selectedIds: string[];
  multiple?: boolean;
  showSearch?: boolean;
  onToggle: (id: string) => void;
  onClearSelection?: () => void;
  onClose: () => void;
  onCreate?: (label: string) => void;
}

export function RecordPickerDropdown({
  anchorRef,
  open,
  options,
  selectedIds,
  multiple = true,
  showSearch = true,
  onToggle,
  onClearSelection,
  onClose,
  onCreate,
}: RecordPickerDropdownProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280, placeAbove: false });

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }

    const frame = requestAnimationFrame(() => searchRef.current?.focus());

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const placeAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
      setPosition({
        top: placeAbove ? Math.max(8, rect.top - 8) : rect.bottom + 8,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 280) - 16)),
        width: Math.max(rect.width, 280),
        placeAbove,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [anchorRef, onClose, open]);

  const trimmedSearch = search.trim();
  const filteredOptions = useMemo(() => {
    if (!trimmedSearch) return options;
    const query = trimmedSearch.toLowerCase();
    return options.filter((option) =>
      `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(query),
    );
  }, [options, trimmedSearch]);

  const exactMatch = trimmedSearch
    ? options.some((option) => option.label.toLowerCase() === trimmedSearch.toLowerCase())
    : false;
  const canCreate = Boolean(onCreate && trimmedSearch && !exactMatch);

  function handleCreate() {
    if (!canCreate || !onCreate) return;
    onCreate(trimmedSearch);
    if (!multiple) onClose();
    setSearch("");
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[80] flex flex-col overflow-hidden rounded-xl bg-[var(--mantle)] shadow-[var(--shadow-elevated)]"
      style={{
        top: position.placeAbove ? undefined : position.top,
        bottom: position.placeAbove ? window.innerHeight - position.top : undefined,
        left: position.left,
        width: position.width,
        maxHeight: 340,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {showSearch ? (
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--base)] px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                handleCreate();
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder={onCreate ? "Search or create…" : "Search…"}
            className="h-6 w-full bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
          />
        </div>
      ) : null}

      {multiple && selectedIds.length > 0 ? (
        <div className="border-b border-[var(--border-subtle)] px-3 py-2.5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            Selected
          </div>
          <div className="flex flex-wrap gap-1">
          {selectedIds.map((id) => {
            const option = options.find((candidate) => candidate.id === id);
            if (!option) return null;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onToggle(option.id)}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--base)] px-2 py-0.5 text-[11px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <span className="max-w-[140px] truncate">{option.label}</span>
                <span className="text-[var(--overlay-1)]">×</span>
              </button>
            );
          })}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-1.5">
        {filteredOptions.length ? (
          filteredOptions.map((option) => {
            const selected = selectedIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onToggle(option.id);
                  if (!multiple) {
                    onClose();
                  }
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                  selected
                    ? "bg-[color-mix(in_srgb,var(--accent)_14%,var(--mantle)_86%)] text-[var(--text)]"
                    : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{option.label}</div>
                  {option.meta ? (
                    <div className="truncate text-[11px] text-[var(--overlay-1)]">{option.meta}</div>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                    selected
                      ? "border-[var(--accent-border)] bg-[var(--accent)] text-[var(--crust)]"
                      : "border-[var(--border)] text-transparent",
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={2.4} />
                </span>
              </button>
            );
          })
        ) : !canCreate ? (
          <div className="px-3 py-6 text-center text-[12px] text-[var(--overlay-1)]">
            No matching records
          </div>
        ) : null}

        {canCreate ? (
          <button
            type="button"
            onClick={handleCreate}
            className="mt-1 flex w-full items-center gap-1.5 rounded-xl bg-[var(--base)] px-2.5 py-2 text-left text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Create</span>
            <span className="truncate font-medium text-[var(--text)]">&ldquo;{trimmedSearch}&rdquo;</span>
          </button>
        ) : null}
      </div>

      {multiple ? (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--base)_38%,transparent)] px-3 py-2.5">
          <div className="text-[11px] text-[var(--overlay-1)]">
            {selectedIds.length === 0
              ? "No records selected"
              : `${selectedIds.length} selected`}
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (onClearSelection) {
                onClearSelection();
                return;
              }
              for (const id of selectedIds) {
                onToggle(id);
              }
            }}
            className="rounded-md px-2 py-1 text-[12px] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-[var(--crust)] transition-opacity hover:opacity-90"
          >
            Done
          </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
