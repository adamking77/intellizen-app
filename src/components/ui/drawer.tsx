import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}

const focusable = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Drawer({ open, onClose, label, children, className }: DrawerProps) {
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = drawer.current;
    node?.querySelector<HTMLElement>(focusable)?.focus();

    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(focusable)];
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      opener?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <aside
      ref={drawer}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cn("kit-drawer absolute inset-y-2 right-2 z-50 w-80 overflow-y-auto rounded-[var(--r-plane)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]", className)}
    >
      {children}
    </aside>
  );
}
