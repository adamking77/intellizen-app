import { AlertCircle, Loader2, MessageSquareText, Radio } from "lucide-react";

import { cn } from "@/lib/utils";

export type AgentPanelDisplayMode = "collapsed" | "docked" | "standalone";
export type AgentPanelAvailability =
  | "loading"
  | "ready"
  | "working"
  | "blocked"
  | "unavailable"
  | "offline"
  | "empty"
  | "error";

const STATUS_COPY: Record<
  AgentPanelAvailability,
  { label: string; tone: string }
> = {
  loading: { label: "Checking role", tone: "text-[var(--overlay-1)]" },
  ready: { label: "Ready", tone: "text-[var(--success)]" },
  working: { label: "Working", tone: "text-[var(--accent)]" },
  blocked: { label: "Blocked", tone: "text-[var(--warning)]" },
  unavailable: { label: "Unavailable", tone: "text-[var(--danger)]" },
  offline: { label: "Offline", tone: "text-[var(--danger)]" },
  empty: { label: "No conversation yet", tone: "text-[var(--overlay-1)]" },
  error: { label: "Conversation unavailable", tone: "text-[var(--danger)]" },
};

export function AgentPanelState({
  mode,
  state,
  detail,
}: {
  mode: AgentPanelDisplayMode;
  state: AgentPanelAvailability;
  detail?: string | null;
}) {
  const status = STATUS_COPY[state];
  const Icon =
    state === "loading"
      ? Loader2
      : state === "error" || state === "offline" || state === "unavailable"
        ? AlertCircle
        : state === "empty"
          ? MessageSquareText
          : Radio;

  if (mode === "collapsed") {
    return (
      <span
        data-panel-mode={mode}
        data-panel-state={state}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]",
          status.tone,
        )}
        aria-label={detail ? `${status.label}: ${detail}` : status.label}
        title={detail ? `${status.label}: ${detail}` : status.label}
      >
        <Icon
          className={cn("h-3.5 w-3.5", state === "loading" && "animate-spin")}
          aria-hidden
        />
      </span>
    );
  }

  return (
    <div
      data-panel-mode={mode}
      data-panel-state={state}
      className="flex min-w-0 items-start gap-2"
    >
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          status.tone,
          state === "loading" && "animate-spin",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={cn("font-ui text-[11px] font-medium", status.tone)}>
          {status.label}
        </p>
        {detail ? (
          <p className="mt-0.5 break-words font-ui text-[10px] leading-4 text-[var(--overlay-1)]">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
