import { forwardRef, type KeyboardEvent } from "react";
import { ArrowUp, Check, PictureInPicture2, Square } from "lucide-react";

import { doneIn } from "@/components/agent/turn-time";
import { Control } from "@/components/ui/control";
import { Pill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import type { TurnOutcome } from "@/engine/transcript";

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
    <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-[var(--r-pill)]" style={{ background: tone }} />
  );
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-0.5 pb-1.5" data-run-state={run.kind}>
      {run.kind === "opening" ? (
        <>
          {dot("var(--text-muted)")}
          <span className="truncate font-ui text-[var(--t-meta)] text-[var(--text-muted)]">Opening a session with {agent}…</span>
        </>
      ) : run.kind === "working" ? (
        <>
          {dot("var(--text-muted)")}
          <span className="truncate font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
            {run.label ? `${agent} · ${run.label}` : `${agent} is working…`}
          </span>
        </>
      ) : run.kind === "waiting" ? (
        <>
          <Pill variant="waiting">waiting on you</Pill>
          <span className="truncate font-ui text-[var(--t-meta)] text-[var(--text-muted)]">{agent} needs a decision above.</span>
        </>
      ) : run.kind === "done" ? (
        <>
          {run.outcome.status === "interrupted" ? (
            dot("color-mix(in srgb, var(--text) 70%, transparent)")
          ) : (
            <Check className="h-3 w-3 shrink-0 text-[var(--ok)]" strokeWidth={1.5} aria-hidden />
          )}
          <span className="truncate font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
            {run.outcome.status === "interrupted" ? "Stopped" : `Done in ${doneIn(run.outcome.tookMs)}`}
          </span>
        </>
      ) : (
        <>
          {dot("var(--bad)")}
          <span className="truncate font-ui text-[var(--t-meta)] text-[var(--text-muted)]">Failed · {run.reason}</span>
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
  /** Beside the controls: the microphone. In the send slot when the draft is
   *  empty: the conversation toggle. Both from the surface's one `useVoice`. */
  dictate?: React.ReactNode;
  converse?: React.ReactNode;
  /** Whatever the voice stack has to say, above the box it is about. */
  note?: string | null;
  /** Live speech preview is visible but not editable until Stop commits it. */
  dictating?: boolean;
  /** Enter sends when true; otherwise ⌘/Ctrl+Enter sends. */
  sendOnEnter?: boolean;
}

/** The composer separates from the panel by a hairline, not by fill: on the
 *  dark flavors no fill value reads as a plane. Enter sends, Shift+Enter
 *  breaks a line, Send becomes Stop while a turn runs. */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  {
    draft,
    onDraft,
    onSend,
    onStop,
    onEject,
    placeholder,
    ready,
    running,
    agent,
    permission,
    dictate,
    converse,
    note,
    dictating = false,
    sendOnEnter = true,
  },
  ref,
) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const sendKey = sendOnEnter
      ? e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
      : e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey);
    if (sendKey) {
      e.preventDefault();
      onSend();
    }
  };
  const canSend = ready && !running && draft.trim().length > 0;
  return (
    <div className="flex shrink-0 flex-col gap-2 bg-[var(--base)] px-[11px] py-2.5">
      {note ? (
        <p role="status" className="font-ui text-[var(--t-section)] leading-snug text-[var(--bad)]">
          {note}
        </p>
      ) : null}
      <Textarea
        ref={ref}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={!agent}
        readOnly={dictating}
        aria-label={agent ? `Message ${agent}` : "Message"}
        className="w-full resize-none font-ui text-[var(--t-ui)] leading-normal text-[var(--text)] placeholder:text-[var(--text-muted)]"
      />
      <div className="flex items-center gap-2">
        {onEject ? (
          <Control
            onClick={onEject}
            aria-label="Eject agent panel"
            title="Eject to its own window"
            variant="quiet"
            size="icon"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </Control>
        ) : null}
        {dictate}
        {permission ? <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">{permission}</span> : null}
        <div className="flex-1" />
        {/* The send slot: the conversation toggle while there is nothing to
            send, Send once there is. A composer with text has an obvious next
            act; one without has the slot free. */}
        {!running && !draft.trim() && converse ? (
          converse
        ) : running ? (
          <Control
            onClick={onStop}
            aria-label="Stop this turn"
            title="Stop"
            variant="quiet"
            size="icon"
          >
            <Square className="h-[11px] w-[11px]" strokeWidth={2.2} aria-hidden />
          </Control>
        ) : (
          <Control
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            title="Send"
            variant="primary"
            size="icon"
          >
            <ArrowUp className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden />
          </Control>
        )}
      </div>
    </div>
  );
});
