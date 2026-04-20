import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search } from "lucide-react";

import { Badge } from "@/components/database/primitives/Badge";
import { cn } from "@/lib/utils";

interface InlinePillPickerProps {
  options: string[];
  value: string | null;
  groupStatus?: boolean;
  getColor: (option: string) => string;
  onChange: (value: string | null) => void;
  onCreate?: (label: string) => void;
}

type StatusSection = "To-do" | "In progress" | "Complete";

function getStatusSection(label: string): StatusSection {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("done") || normalized.includes("complete")) return "Complete";
  if (
    normalized.includes("progress") ||
    normalized.includes("active") ||
    normalized.includes("doing") ||
    normalized.includes("diagnostic")
  )
    return "In progress";
  return "To-do";
}

export function InlinePillPicker({
  options,
  value,
  groupStatus,
  getColor,
  onChange,
  onCreate,
}: InlinePillPickerProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 220, placeAbove: false });

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const placeAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
      setPosition({
        top: placeAbove ? Math.max(8, rect.top - 8) : rect.bottom + 8,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 236)),
        width: Math.max(220, rect.width),
        placeAbove,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  const trimmedQuery = query.trim();
  const filteredOptions = useMemo(() => {
    if (!trimmedQuery) return options;
    const needle = trimmedQuery.toLowerCase();
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [options, trimmedQuery]);

  const exactMatch = trimmedQuery
    ? options.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase())
    : false;
  const canCreate = Boolean(onCreate && trimmedQuery && !exactMatch);

  function handleCreate() {
    if (!canCreate || !onCreate) return;
    onCreate(trimmedQuery);
    onChange(trimmedQuery);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex min-h-8 items-center gap-1 rounded-full"
      >
        {value ? (
          <Badge color={getColor(value)}>{value}</Badge>
        ) : (
          <span className="text-[13px] text-[var(--overlay-1)] opacity-60">—</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]"
              style={{
                top: position.placeAbove ? undefined : position.top,
                bottom: position.placeAbove ? window.innerHeight - position.top : undefined,
                left: position.left,
                width: position.width,
                maxHeight: 320,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canCreate) {
                      event.preventDefault();
                      handleCreate();
                    } else if (event.key === "Escape") {
                      setOpen(false);
                    }
                  }}
                  placeholder={onCreate ? "Search or create…" : "Search…"}
                  className="h-6 w-full bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-1">
                {value ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  >
                    Clear
                  </button>
                ) : null}

                {renderGroupedOptions({
                  options: filteredOptions,
                  value,
                  groupStatus,
                  getColor,
                  onSelect: (option) => {
                    onChange(option);
                    setOpen(false);
                  },
                })}

                {filteredOptions.length === 0 && !canCreate ? (
                  <div className="px-3 py-4 text-center text-[12px] text-[var(--overlay-1)]">
                    No matching options
                  </div>
                ) : null}

                {canCreate ? (
                  <button
                    type="button"
                    onClick={handleCreate}
                    className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-[var(--border-subtle)] px-2.5 py-2 text-left text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>Create</span>
                    <Badge color={getColor(trimmedQuery)}>{trimmedQuery}</Badge>
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function renderGroupedOptions({
  options,
  value,
  groupStatus,
  getColor,
  onSelect,
}: {
  options: string[];
  value: string | null;
  groupStatus: boolean | undefined;
  getColor: (option: string) => string;
  onSelect: (option: string) => void;
}) {
  if (!groupStatus) {
    return options.map((option) => (
      <OptionRow
        key={option}
        option={option}
        selected={value === option}
        color={getColor(option)}
        onClick={() => onSelect(option)}
      />
    ));
  }

  const buckets: Record<StatusSection, string[]> = {
    "To-do": [],
    "In progress": [],
    Complete: [],
  };
  for (const option of options) {
    buckets[getStatusSection(option)].push(option);
  }
  const sections: StatusSection[] = ["To-do", "In progress", "Complete"];
  return sections
    .filter((section) => buckets[section].length > 0)
    .map((section) => (
      <div key={section} className="py-0.5">
        <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          {section}
        </div>
        {buckets[section].map((option) => (
          <OptionRow
            key={option}
            option={option}
            selected={value === option}
            color={getColor(option)}
            onClick={() => onSelect(option)}
          />
        ))}
      </div>
    ));
}

function OptionRow({
  option,
  selected,
  color,
  onClick,
}: {
  option: string;
  selected: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-wash)]",
        selected ? "bg-[var(--surface-wash)]" : "",
      )}
    >
      <Badge color={color}>{option}</Badge>
    </button>
  );
}
