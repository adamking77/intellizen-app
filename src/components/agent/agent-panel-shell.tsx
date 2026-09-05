import type { PropsWithChildren } from "react";

import { PaneDivider, type PaneResize } from "@/components/layout/pane-resize";
import { cn } from "@/lib/utils";

interface AgentPanelShellProps extends PropsWithChildren {
  standalone: boolean;
  pane?: PaneResize;
  onInteraction: () => void;
}

export function AgentPanelShell({
  standalone,
  pane,
  onInteraction,
  children,
}: AgentPanelShellProps) {
  return (
    <aside
      style={
        standalone
          ? undefined
          : { width: pane?.width ?? 336, background: "var(--mantle)" }
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
      {children}
      {!standalone && pane ? <>
        <PaneDivider pane={pane} edge="left" direction={-1} label="Resize agent panel left edge" />
        <PaneDivider pane={pane} edge="right" direction={1} label="Resize agent panel right edge" />
      </> : null}
    </aside>
  );
}
