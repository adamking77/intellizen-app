import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
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
  onToggle: (id: string) => void;
  onClose: () => void;
}

export function RecordPickerDropdown({
  anchorRef,
  open,
  options,
  selectedIds,
  multiple = true,
  onToggle,
  onClose,
}: RecordPickerDropdownProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280 });

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 360),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 280) - 16)),
        width: Math.max(rect.width, 280),
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
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [anchorRef, onClose, open]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(query),
    );
  }, [options, search]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[80] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
      }}
    >
      <div className="border-b border-[var(--border)] p-3">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3">
          <Search className="h-4 w-4 text-[var(--overlay-1)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search records"
            className="border-0 bg-transparent px-0 shadow-none focus:border-0 focus:shadow-none"
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto p-2">
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
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                  selected
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
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
                    "flex h-5 w-5 items-center justify-center rounded-md border",
                    selected
                      ? "border-[var(--accent-border)] bg-[var(--accent)] text-[var(--crust)]"
                      : "border-[var(--border)] text-transparent",
                  )}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
              </button>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-[12px] text-[var(--overlay-1)]">
            No matching records
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
