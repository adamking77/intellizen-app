import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SaveState, type SaveStateValue } from "@/components/ui/save-state";

interface FieldShellProps {
  label: string;
  labelId?: string;
  status?: SaveStateValue;
  onRetry?: () => void;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function FieldShell({
  label,
  labelId,
  status = "idle",
  onRetry,
  meta,
  actions,
  children,
  className,
  contentClassName,
}: FieldShellProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[var(--border-subtle)] bg-[var(--mantle)]/55",
        "transition-[border-color,background-color] duration-150 focus-within:border-[var(--accent-border)] focus-within:bg-[var(--mantle)]",
        className,
      )}
      aria-labelledby={labelId}
    >
      <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--border-subtle)] px-3 py-2">
        <span id={labelId} className="text-label">
          {label}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          {meta ? <span className="font-mono text-[10px] text-[var(--overlay-1)]">{meta}</span> : null}
          <SaveState state={status} onRetry={onRetry} />
          {actions}
        </div>
      </header>
      <div className={cn("p-3", contentClassName)}>{children}</div>
    </section>
  );
}
