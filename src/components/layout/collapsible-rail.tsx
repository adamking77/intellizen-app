import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

interface CollapsibleRailProps {
  title: string;
  width: CSSProperties["width"];
  collapsed: boolean;
  onCollapse: () => void;
  collapseLabel: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  showCollapseButton?: boolean;
}

export function CollapsibleRail({
  title,
  width,
  collapsed,
  onCollapse,
  collapseLabel,
  actions,
  children,
  className,
  bodyClassName,
  showCollapseButton = true,
}: CollapsibleRailProps) {
  return (
    <aside
      data-collapsible-rail={title}
      style={{ width: collapsed ? 0 : width }}
      aria-hidden={collapsed ? true : undefined}
      className={cn(
        "relative flex shrink-0 flex-col overflow-hidden bg-[var(--mantle)]",
        "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        !collapsed && "border-r border-[var(--border)]",
        collapsed && "invisible",
        className,
      )}
    >
      {!collapsed ? (
        <>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
            <span className="text-label">{title}</span>
            <div className="flex items-center gap-1">
              {actions}
              {showCollapseButton ? (
                <button
                  type="button"
                  onClick={onCollapse}
                  aria-label={collapseLabel}
                  title={collapseLabel}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", bodyClassName)}>
            {children}
          </div>
        </>
      ) : null}
    </aside>
  );
}
