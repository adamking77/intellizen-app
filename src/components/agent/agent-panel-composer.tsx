import type { DragEvent, PropsWithChildren } from "react";

interface AgentPanelComposerProps extends PropsWithChildren {
  contextLabel: string | null;
  onFiles: (files: File[]) => void;
}

export function AgentPanelComposer({
  contextLabel,
  onFiles,
  children,
}: AgentPanelComposerProps) {
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("Files")) event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="shrink-0 px-3 pb-3 pt-1">
      {contextLabel ? (
        <div
          className="mb-1.5 flex min-w-0 items-center gap-1 px-1"
          aria-label="Context that will be sent"
        >
          <span className="shrink-0 font-ui text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            Context
          </span>
          <span className="min-w-0 truncate rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--subtext-0)]">
            {contextLabel}
          </span>
        </div>
      ) : null}
      <div
        className="relative rounded-lg bg-[var(--base)]"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {children}
      </div>
    </div>
  );
}
