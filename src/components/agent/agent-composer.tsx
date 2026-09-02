import { forwardRef, type KeyboardEvent } from "react";
import { ArrowUp, Check, PictureInPicture2, Square } from "lucide-react";

import { doneIn } from "@/components/agent/turn-time";
import type { TurnOutcome } from "@/engine/transcript";
import { cn } from "@/lib/utils";

export type RunState =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "working"; label: string | null }
  | { kind: "waiting" }
  | { kind: "done"; outcome: TurnOutcome }
  | { kind: "failed"; reason: string };

/** Where a run says how it ended. Directly above the composer, so the
 *  answer to "is it still going" is next to the place you would type again.
 *  A quiet label: progress is not an event. */
export function RunStatus({ run, agent }: { run: RunState; agent: string }) {
  if (run.kind === "idle") return null;
  const dot = (tone: string) => (
    <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
  );
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-0.5 pb-1.5" data-run-state={run.kind}>
      {run.kind === "opening" ? (
        <>
          {dot("var(--text-muted)")}
          <span className="truncate font-ui text-[12px] text-[var(--text-muted)]">Opening a session with {agent}…</span>
        </>
      ) : run.kind === "working" ? (
        <>
          {dot("var(--text-muted)")}
          <span className="truncate font-ui text-[12px] text-[var(--text-muted)]">
            {run.label ? `${agent} · ${run.label}` : `${agent} is working…`}
          </span>
        </>
      ) : run.kind === "waiting" ? (
        <>
          <span className="rounded-full bg-[color-mix(in_srgb,var(--wait)_16%,transparent)] px-2 py-px font-ui text-[11px] text-[var(--wait)] whitespace-nowrap">
            waiting on you
          </span>
          <span className="truncate font-ui text-[12px] text-[var(--text-muted)]">{agent} needs a decision above.</span>
        </>
      ) : run.kind === "done" ? (
        <>
          {run.outcome.status === "interrupted" ? (
            dot("color-mix(in srgb, var(--text) 70%, transparent)")
          ) : (
            <Check className="h-3 w-3 shrink-0 text-[var(--ok)]" strokeWidth={1.5} aria-hidden />
          )}
          <span className="truncate font-ui text-[12px] text-[var(--text-muted)]">
            {run.outcome.status === "interrupted" ? "Stopped" : `Done in ${doneIn(run.outcome.tookMs)}`}
          </span>
        </>
      ) : (
        <>
          {dot("var(--bad)")}
          <span className="truncate font-ui text-[12px] text-[var(--text-muted)]">Failed · {run.reason}</span>
        </>
      )}
    </div>
  );
}

export interface ComposerProps {
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onEject?: () => void;
  placeholder: string;
  /** The gateway can take a prompt right now. */
  ready: boolean;
  running: boolean;
  agent: string | null;
  /** Permission stated as a word, from the session; absent until known. */
  permission: string | null;
}

/** The composer separates from the panel by a hairline, not by fill: on the
 *  dark flavors no fill value reads as a plane. Enter sends, Shift+Enter
 *  breaks a line, Send becomes Stop while a turn runs. */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { draft, onDraft, onSend, onStop, onEject, placeholder, ready, running, agent, permission },
  ref,
) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      onSend();
    }
  };
  const canSend = ready && !running && draft.trim().length > 0;
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border-t border-[var(--edge)] bg-[var(--base)] px-[11px] py-2.5">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={!ready}
        aria-label={agent ? `Message ${agent}` : "Message"}
        className="w-full resize-none bg-transparent font-ui text-[13px] leading-normal text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex items-center gap-2">
        {onEject ? (
          <button
            type="button"
            onClick={onEject}
            aria-label="Eject agent panel"
            title="Eject to its own window"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
        {permission ? <span className="font-ui text-[12px] text-[var(--text-muted)]">{permission}</span> : null}
        <div className="flex-1" />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop this turn"
            title="Stop"
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <Square className="h-[11px] w-[11px]" strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            title="Send"
            className={cn(
              "inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--go-bg)] text-[var(--go-fg)] transition-opacity",
              "disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
            )}
          >
            <ArrowUp className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
});
