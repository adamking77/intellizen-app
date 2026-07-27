import type { PropsWithChildren, Ref, UIEvent } from "react";

interface AgentPanelThreadProps extends PropsWithChildren {
  containerRef: Ref<HTMLDivElement>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
}

export function AgentPanelThread({
  containerRef,
  onScroll,
  children,
}: AgentPanelThreadProps) {
  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3"
      onScroll={onScroll}
    >
      {children}
    </div>
  );
}
