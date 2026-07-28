import { ArrowUpRight, CircleAlert, Clock3, Radio } from "lucide-react";

import type { ActiveWorkItem } from "@/lib/active-work";
import { cn } from "@/lib/utils";

export function AgentActiveWork({
  item,
  onOpen,
}: {
  item: ActiveWorkItem;
  onOpen: (path: string) => void;
}) {
  const Icon =
    item.state === "blocked"
      ? CircleAlert
      : item.state === "awaiting-approval" || item.state === "queued"
        ? Clock3
        : Radio;
  return (
    <button
      type="button"
      onClick={() => onOpen(item.canonicalPath)}
      className="group flex w-full items-center gap-2 border-b border-[var(--border)] bg-[var(--base)] px-4 py-2 text-left transition-colors hover:bg-[var(--surface-wash)]"
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          item.state === "working"
            ? "text-[var(--accent)]"
            : "text-[var(--warning)]",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-ui text-[11px] font-medium text-[var(--text)]">
          Working on {item.title}
        </span>
        <span className="block truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--overlay-1)]">
          {item.status}
          {item.currentStep ? ` · ${item.currentStep}` : ""}
        </span>
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)] transition-colors group-hover:text-[var(--accent)]" />
    </button>
  );
}
