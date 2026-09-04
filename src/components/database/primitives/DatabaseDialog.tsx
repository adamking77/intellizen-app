import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DatabaseDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  className?: string;
  role?: "dialog" | "alertdialog";
}

export function DatabaseDialog({
  open,
  title,
  description,
  children,
  footer,
  onOpenChange,
  className,
  role = "dialog",
}: DatabaseDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      role={role}
      hidden={!open}
      className={cn(
        "db-app-dialog m-auto max-h-[calc(100dvh-3rem)] min-w-[320px] max-w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-0 text-[var(--text)] outline-none",
        className,
      )}
      style={{ boxShadow: "var(--shadow-elevated)" }}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
        <header className="shrink-0 border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 className="font-ui text-[16px] font-semibold text-[var(--text)]">{title}</h2>
          {description ? <p className="mt-1 font-ui text-[13px] leading-5 text-[var(--subtext-0)]">{description}</p> : null}
        </header>
        <div className="min-h-0 max-h-[min(70vh,720px)] flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-4">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
