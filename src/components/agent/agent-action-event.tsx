import { useState } from "react";
import { ChevronDown, CircleCheck, CircleDashed, CircleX, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { ConversationActionEvent } from "@/lib/agent-conversation";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<ConversationActionEvent["state"], string> = {
  requested: "Requested",
  running: "Running",
  queued: "Queued",
  needs_approval: "Needs approval",
  completed: "Completed",
  failed: "Failed",
};

function StateIcon({ state }: { state: ConversationActionEvent["state"] }) {
  if (state === "completed") return <CircleCheck className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" />;
  if (state === "failed") return <CircleX className="h-3.5 w-3.5 text-[var(--danger)]" aria-hidden="true" />;
  return <CircleDashed className="h-3.5 w-3.5 text-[var(--caution)]" aria-hidden="true" />;
}

export function AgentActionEvent({ event }: { event: ConversationActionEvent }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const recordRoute = event.canonicalRecord
    ? `/databases/${event.canonicalRecord.databaseId}?record=${event.canonicalRecord.recordId}`
    : null;

  return (
    <div className="my-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-wash)]">
      <button
        type="button"
        className="flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-border)]"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <StateIcon state={event.state} />
        <span className="min-w-0 flex-1 truncate font-ui text-[11.5px] font-medium text-[var(--subtext-1)]">
          {event.label}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] uppercase tracking-[0.14em]",
            event.state === "completed" && "text-[var(--success)]",
            event.state === "failed" && "text-[var(--danger)]",
            event.state !== "completed" && event.state !== "failed" && "text-[var(--caution)]",
          )}
        >
          {STATE_LABELS[event.state]}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)] transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className="border-t border-[var(--border-subtle)] px-2.5 py-2">
          <p className="font-ui text-[11px] leading-relaxed text-[var(--subtext-0)]">{event.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--overlay-1)]">
            <span>{event.actionKind}</span>
            <span>{new Date(event.createdAt).toLocaleString()}</span>
            {event.evidence ? <span>{event.evidence.kind}</span> : null}
          </div>
          {recordRoute ? (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 font-ui text-[10.5px] font-medium text-[var(--accent)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
              onClick={() => navigate(recordRoute)}
            >
              Open canonical record
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
