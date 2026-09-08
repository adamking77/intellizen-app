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
  const visibleQuestions = mode === "not_today" ? [] : questionKeys;
  const hasPulse = activityState === "known" && (traces.length > 0 || visibleQuestions.length > 0);
  const setAside = mode === "executing" && (aside ? onRestore : onSetAside);

  useLayoutEffect(() => {
    const button = activeControl.current;
    if (!button) return;
    const measure = () => setIndicatorOffset(button.offsetLeft + (button.offsetWidth - 16) / 2);
    measure();
    const observer = new ResizeObserver(measure);
    if (button.parentElement) observer.observe(button.parentElement);
    observer.observe(button);
    return () => observer.disconnect();
  }, [mode]);

  return (
    <div className="@container relative flex w-full min-w-0 flex-wrap items-center justify-between gap-2" data-home-dock>
      <div className="flex min-h-[36px] min-w-0 max-w-full flex-wrap items-center gap-0.5 rounded-[var(--r-pill)] bg-[var(--surface)] p-1 @max-[36rem]:rounded-[var(--r-ctl)]">
      <div role="group" aria-label="Session mode" className="relative flex min-h-[var(--h-ctl)] min-w-0 max-w-full flex-wrap justify-center gap-0.5 @max-[22rem]:rounded-[var(--r-ctl)]">
        {MODES.map((candidate) => (
          <Control
            key={candidate}
            ref={mode === candidate ? activeControl : undefined}
            size="sm"
            variant="text"
            aria-pressed={mode === candidate}
            data-session-mode={candidate}
            onClick={() => onModeChange(candidate)}
            onKeyDown={(event) => {
              const index = MODES.indexOf(candidate);
              const next = event.key === "Home" ? 0 : event.key === "End" ? MODES.length - 1
                : event.key === "ArrowRight" ? (index + 1) % MODES.length
                  : event.key === "ArrowLeft" ? (index + MODES.length - 1) % MODES.length : null;
              if (next === null) return;
              event.preventDefault();
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
              onModeChange(MODES[next]);
              // Home changes its content branch, so restore focus after that render.
              requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-home-dock] [data-session-mode="${MODES[next]}"]`)?.focus());
            }}
            className={cn("min-h-[var(--h-ctl)] px-2.5 no-underline", mode === candidate ? "text-[var(--text)] @max-[22rem]:underline" : "text-[var(--text-dim)]")}
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
        <Control size="sm" variant="quiet" disabled={aside} aria-label="Set this project aside" title="Set this project aside" className="px-2.5" onClick={onSetAside}>
          <DoneWord done={Boolean(aside)} doneLabel="Set aside">Set aside</DoneWord>
        </Control>
        {aside ? <Control size="sm" variant="quiet" onClick={onRestore}>Restore</Control> : null}
      </div> : null}
      </div>
      <div className="ml-auto flex min-h-[36px] min-w-0 max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1 rounded-[var(--r-pill)] bg-[var(--surface)] px-3 py-1">
        <span className="font-mono text-[length:var(--t-count)] text-[var(--text-dim)]">{SESSION_MODE_LABEL[mode]}</span>
        {hasPulse ? <Pulse traces={traces} questions={visibleQuestions} state={activityState} className="h-4 w-14 shrink-0" /> : null}
        {traces.filter((trace) => trace.label).map((trace) => <span key={trace.id} className="min-w-0 break-words font-mono text-[length:var(--t-count)] text-[var(--text-muted)]">{trace.label}{trace.state ? ` · ${trace.state}` : ""}</span>)}
        {activityState !== "known" ? <span className="font-mono text-[length:var(--t-count)] text-[var(--text-muted)]">{activityState === "loading" ? "Loading activity" : "Activity unavailable"}</span> : visibleQuestions.length > 0 ? <Control size="sm" variant="text" className="font-mono text-[length:var(--t-count)] text-[var(--question)]" onClick={() => onModeChange("deciding")}>{visibleQuestions.length} {visibleQuestions.length === 1 ? "question" : "questions"} for you</Control> : null}
      </div>
    </div>
  );
}
