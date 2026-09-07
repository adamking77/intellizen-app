import { Pulse } from "@/components/activity/pulse";
import { Control } from "@/components/ui/control";
import { DoneWord, useInputModality, useMotionEnabled } from "@/components/ui/motion";
import { SESSION_MODE_LABEL } from "@/lib/home-availability";
import type { SessionMode } from "@/lib/session-mode";
import type { PulseTrace } from "@/components/activity/pulse";
import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

const MODES: SessionMode[] = ["thinking", "deciding", "executing", "not_today"];

export function Dock({
  mode,
  onModeChange,
  traces,
  questionKeys,
  aside,
  onSetAside,
  onRestore,
  activityState = "known",
}: {
  mode: SessionMode;
  onModeChange: (mode: SessionMode) => void;
  traces: PulseTrace[];
  questionKeys: string[];
  aside?: boolean;
  onSetAside?: () => void;
  onRestore?: () => void;
  activityState?: "known" | "loading" | "unknown";
}) {
  const activeControl = useRef<HTMLButtonElement>(null);
  const [indicatorOffset, setIndicatorOffset] = useState(0);
  const motionEnabled = useMotionEnabled();
  const modality = useInputModality();
  const hasPulse = activityState === "known" && (traces.length > 0 || questionKeys.length > 0);
  const setAside = mode === "executing" && (aside ? onRestore : onSetAside);

  useLayoutEffect(() => {
    const button = activeControl.current;
    if (button) setIndicatorOffset(button.offsetLeft + (button.offsetWidth - 16) / 2);
  }, [mode]);

  return (
    <div className="@container flex w-full min-w-0 flex-wrap items-center justify-center gap-2" data-home-dock>
      <div role="group" aria-label="Session mode" className="relative flex max-w-full flex-wrap justify-center gap-0.5 rounded-[var(--r-pill)] border border-[var(--surface-line)] bg-[var(--surface)] p-1 @max-[22rem]:rounded-[var(--r-ctl)]">
        {MODES.map((candidate) => (
          <Control
            key={candidate}
            ref={mode === candidate ? activeControl : undefined}
            size="sm"
            variant="text"
            aria-pressed={mode === candidate}
            onClick={() => onModeChange(candidate)}
            className={cn("min-h-[var(--h-ctl)] px-2.5", mode === candidate ? "text-[var(--text)]" : "text-[var(--text-dim)]")}
          >
            {SESSION_MODE_LABEL[candidate]}
          </Control>
        ))}
        <span
          aria-hidden
          data-dock-indicator
          className={cn(
            "pointer-events-none absolute bottom-1 left-0 h-px w-4 bg-[var(--text)] @max-[22rem]:hidden",
            motionEnabled && modality === "pointer" ? "transition-transform duration-[var(--dur-pane)] ease-[var(--ease-in-out)]" : "transition-none",
          )}
          style={{ transform: `translateX(${indicatorOffset}px)` }}
        />
      </div>
      {setAside ? <div className="flex items-center gap-2">
        <Control size="sm" variant="quiet" disabled={aside} className="rounded-[var(--r-pill)] bg-[var(--surface)] px-3" onClick={onSetAside}>
          <DoneWord done={Boolean(aside)} doneLabel="Set aside">Set this project aside</DoneWord>
        </Control>
        {aside ? <Control size="sm" variant="quiet" onClick={onRestore}>Restore</Control> : null}
      </div> : null}
      <div className="flex max-w-full items-center gap-2 rounded-[var(--r-pill)] border border-[var(--surface-line)] bg-[var(--surface)] px-3 py-1.5">
        <span className="font-mono text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-dim)]">{SESSION_MODE_LABEL[mode]}</span>
        {hasPulse ? <Pulse traces={traces} questions={questionKeys} state={activityState} className="h-4 w-14 shrink-0" /> : null}
        <span className="font-mono text-[var(--t-count)] text-[var(--text-muted)]">{activityState === "known" ? `${questionKeys.length} ${questionKeys.length === 1 ? "question" : "questions"}` : activityState === "loading" ? "Loading activity" : "Activity unknown"}</span>
      </div>
    </div>
  );
}
