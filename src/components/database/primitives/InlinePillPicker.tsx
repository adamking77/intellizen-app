import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/database/primitives/Badge";
import { cn } from "@/lib/utils";

interface InlinePillPickerProps {
  options: string[];
  value: string | null;
  placeholder?: string;
  getColor: (option: string) => string;
  onChange: (value: string | null) => void;
}

export function InlinePillPicker({
  options,
  value,
  placeholder = "Empty",
  getColor,
  onChange,
}: InlinePillPickerProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 220 });

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 320),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 236)),
        width: Math.max(220, rect.width),
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
          <span className="text-[12px] text-[var(--overlay-1)]">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[80] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-2 shadow-[var(--shadow-elevated)]"
              style={{ top: position.top, left: position.left, width: position.width }}
            >
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex w-full rounded-xl px-3 py-2 text-left text-[12px] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                Clear
              </button>
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--surface-wash)]",
                    value === option ? "bg-[var(--surface-wash)]" : "",
                  )}
                >
                  <Badge color={getColor(option)}>{option}</Badge>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
