import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";
import { useInputModality, useMotionEnabled } from "./motion";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}

const focusable = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Drawer({ open, onClose, label, children, className }: DrawerProps) {
  const drawer = useRef<HTMLElement>(null);
  const enabled = useMotionEnabled();
  const modality = useInputModality();
  const transition = modality === "pointer" && document.documentElement.dataset.viewTransition !== "drawer";
  const movement = enabled && transition;

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

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          ref={drawer}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          initial={transition ? { opacity: 0, transform: movement ? "translateX(24px)" : "translateX(0)" } : false}
          animate={{ opacity: 1, transform: "translateX(0)" }}
          exit={transition ? { opacity: 0, transform: movement ? "translateX(24px)" : "translateX(0)" } : undefined}
          transition={{ duration: transition ? 0.24 : 0, ease: [0.32, 0.72, 0, 1] }}
          style={{ viewTransitionName: "kit-drawer", animation: "none" }}
          className={cn("kit-drawer absolute inset-y-2 right-2 z-50 w-80 overflow-y-auto rounded-[var(--r-plane)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]", className)}
        >
          {children}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
