import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useInputModality, useMotionEnabled } from "./motion";

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
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const enabled = useMotionEnabled();
  const modality = useInputModality();

  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    }
    document.addEventListener("mousedown", handleDown);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, []);

  // Clamp to viewport
  const clampedX = Math.max(0, Math.min(x, window.innerWidth - 180));
  const clampedY = Math.max(0, Math.min(y, window.innerHeight - items.length * 34 - 16));

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    buttons[(current + step + buttons.length) % buttons.length]?.focus();
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Actions"
      onKeyDown={moveFocus}
      style={{ top: clampedY, left: clampedX }}
      data-motion={modality === "keyboard" ? "instant" : enabled ? "full" : "reduced"}
      className="motion-popover fixed z-[9999] min-w-[160px] rounded-[var(--r-surface)] bg-[var(--surface)] p-1.5 outline-none shadow-none"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => { item.onSelect(); onClose(); }}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[var(--r-ctl)] px-2.5 py-1.5 text-left text-[length:var(--t-ui)]",
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
