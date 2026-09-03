import type { PropsWithChildren, PointerEvent } from "react";

import { PaneResizeEdges } from "@/components/layout/window-chrome";
import { cn } from "@/lib/utils";

interface AgentPanelShellProps extends PropsWithChildren {
  standalone: boolean;
  width: number;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onInteraction: () => void;
}

export function AgentPanelShell({
  standalone,
  width,
  onResizeStart,
  onInteraction,
  children,
}: AgentPanelShellProps) {
  return (
    <aside
      style={
        standalone
          ? undefined
          : { width, background: "var(--mantle)" }
      }
      className={cn(
        "pane relative flex shrink-0 flex-col",
        standalone
          ? "h-full w-full rounded-none bg-[var(--mantle)]"
          : "h-full",
      )}
      onFocusCapture={onInteraction}
      onPointerDown={onInteraction}
    >
      {!standalone ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize agent panel"
          onPointerDown={onResizeStart}
          className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-[var(--accent-border)]"
        />
      ) : null}
      {children}
      {!standalone ? <PaneResizeEdges east hideLeft /> : null}
    </aside>
  );
}
