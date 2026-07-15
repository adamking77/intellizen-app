import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "danger";
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const clampedX = Math.min(x, window.innerWidth - 180);
  const clampedY = Math.min(y, window.innerHeight - items.length * 34 - 16);

  return createPortal(
    <div
      ref={ref}
      style={{ top: clampedY, left: clampedX }}
      className="fixed z-[9999] min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--base)] p-1.5 shadow-[var(--shadow-elevated)]"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => { item.onSelect(); onClose(); }}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
            item.variant === "danger"
              ? "text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
              : "text-[var(--text)] hover:bg-[var(--surface-wash)]",
          )}
        >
          {item.icon && <span className="h-3.5 w-3.5 shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export interface ContextMenuState {
  x: number;
  y: number;
}
