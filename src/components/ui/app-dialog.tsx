import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AppDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  role?: "dialog" | "alertdialog";
  initialFocus?: "title";
}

/** Native dialog supplies Escape, focus trapping and focus restoration. */
export function AppDialog({
  open,
  title,
  description,
  children,
  footer,
  onOpenChange,
  className,
  bodyClassName,
  headerClassName,
  role = "dialog",
  initialFocus,
}: AppDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      if (initialFocus === "title") {
        heading.current?.focus({ preventScroll: true });
        if (body.current) body.current.scrollTop = 0;
      }
    }
    if (!open && node.open) node.close();
  }, [open, initialFocus]);

  return (
    <dialog
      ref={dialog}
      role={role}
      aria-label={title}
      className={cn(
        "app-dialog modal-surface m-auto max-h-[86dvh] min-w-[320px] max-w-[min(560px,calc(100vw-24px))] overflow-hidden p-0 text-[var(--text)]",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="flex max-h-[86dvh] flex-col">
        <header className={cn("shrink-0 px-[19px] pb-2 pt-[17px]", headerClassName)}>
          <h2 ref={heading} tabIndex={initialFocus === "title" ? -1 : undefined} className={cn("font-ui text-[var(--t-ui)] font-medium text-[var(--text)]", initialFocus === "title" && "focus-visible:!outline-none")}>{title}</h2>
          {description ? (
            <p className="mt-1 font-ui text-[var(--t-meta)] leading-[1.45] text-[var(--text-muted)]">{description}</p>
          ) : null}
        </header>
        <div ref={body} className={cn("min-h-0 flex-1 overflow-y-auto px-[19px] py-3", bodyClassName)}>{children}</div>
        {footer ? <footer className="flex shrink-0 justify-end gap-2 px-[19px] pb-[17px] pt-2">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
