import { useEffect } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="min-w-[320px] max-w-[420px] overflow-hidden rounded-2xl bg-[var(--mantle)]"
        style={{ boxShadow: "var(--shadow-elevated)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h3 id="confirm-dialog-title" className="text-[16px] font-semibold text-[var(--text)]">
            {title}
          </h3>
        </div>
        <div className="border-t border-[var(--border-subtle)] px-5 py-4">
          <p className="text-[13px] leading-5 text-[var(--subtext-0)]">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-4">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? "destructive" : "primary"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
