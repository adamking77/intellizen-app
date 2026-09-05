/** The two voice controls a composer carries.
 *
 *  `mode="dictate"` is the microphone: it types one sentence for you, and
 *  while recording it becomes cancel, waveform and stop. `mode="converse"` is
 *  the donor's conversation toggle (`AudioLines`, `Square` when on) for the
 *  send slot: shown when the composer is empty, because a composer with text
 *  has an obvious next act and one without has the slot free.
 *
 *  A surface that has both calls `useVoice` once and hands the handle to
 *  each; a mount with only `onTranscript` owns its own microphone.
 */

import { AudioLines, Mic, Square, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVoice, type VoiceHandle } from "./use-voice";
import { Waveform } from "./waveform";

export interface VoiceButtonProps {
  /** Where a dictated sentence lands, unsent. */
  onTranscript: (text: string) => void;
  mode: "dictate" | "converse";
  /** The surface's `useVoice` handle. Required for `converse`; for `dictate`
   *  the button opens its own microphone when it is absent. */
  voice?: VoiceHandle;
  size?: number;
  className?: string;
}

const icon =
  "inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[var(--text-muted)] transition-colors " +
  "hover:bg-[var(--hover-strong)] hover:text-[var(--text)] disabled:opacity-45 disabled:hover:bg-transparent";

export function VoiceButton(props: VoiceButtonProps) {
  return props.mode === "converse" ? <ConverseButton {...props} /> : <DictateButton {...props} />;
}

function DictateButton({ onTranscript, voice, size = 14, className }: VoiceButtonProps) {
  const own = useVoice({ profile: null, messages: [], sending: false, onSend: onTranscript, onTranscript });
  const v = voice ?? own;

  if (v.mine) {
    // Cancel, waveform, stop, and nothing else: while speaking there is
    // nothing else to do.
    return (
      <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
        <button type="button" onClick={v.abandon} aria-label="Cancel recording" title="Cancel" className={icon}>
          <X style={{ width: size, height: size }} strokeWidth={1.7} aria-hidden />
        </button>
        <Waveform color="var(--accent)" height={18} bars={16} levels={v.levels} />
        <button
          type="button"
          onClick={() => void v.dictate()}
          aria-label="Stop recording"
          title="Stop"
          className={cn(icon, "text-[var(--accent-text)]")}
        >
          <Square style={{ width: size - 3, height: size - 3 }} strokeWidth={0} fill="currentColor" aria-hidden />
        </button>
      </div>
    );
  }

  const label = v.hearing ? "Typing what was said…" : v.dictationOn ? "Speak instead of typing" : "Dictation is switched off in Settings";
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => void v.dictate()}
        disabled={v.hearing}
        aria-label={label}
        title={label}
        className={icon}
      >
        <Mic style={{ width: size, height: size }} strokeWidth={1.7} aria-hidden />
      </button>
      {v.note ? (
        <span role="status" className="truncate font-ui text-[var(--t-section)] text-[var(--bad)]" title={v.note}>
          {v.note}
        </span>
      ) : null}
    </div>
  );
}

function ConverseButton({ voice, size = 13, className }: VoiceButtonProps) {
  const v = voice;
  if (!v) return null;
  const on = v.convo;
  // Codex's own words: "Start voice chat" / "Stop voice chat" name the act.
  const label = on ? "Stop voice chat" : v.canConverse ? "Start voice chat" : v.why;
  return (
    <button
      type="button"
      onClick={() => v.setConvo(!on)}
      disabled={!v.canConverse && !on}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        className ??
          "inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--go-bg)] text-[var(--go-fg)] transition-opacity disabled:opacity-40",
      )}
      // A running conversation gets its own unmistakable control rather than
      // the same one tinted.
      style={on ? { color: "var(--bad)" } : undefined}
    >
      {on ? (
        <Square style={{ width: size - 3, height: size - 3 }} strokeWidth={0} fill="currentColor" aria-hidden />
      ) : (
        <AudioLines style={{ width: size, height: size }} strokeWidth={1.7} aria-hidden />
      )}
    </button>
  );
}
