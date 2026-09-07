import { Pulse } from "@/components/activity/pulse";
import { Control } from "@/components/ui/control";
import { SESSION_MODE_LABEL } from "@/lib/home-availability";
import type { SessionMode } from "@/lib/session-mode";
import type { PulseTrace } from "@/components/activity/pulse";
import { cn } from "@/lib/utils";

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
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-home-dock>
      <div role="group" aria-label="Session mode" className="flex rounded-[var(--r-pill)] border border-[var(--surface-line)] bg-[var(--surface)] p-1">
        {MODES.map((candidate) => (
          <Control
            key={candidate}
            size="sm"
            variant="text"
            aria-pressed={mode === candidate}
            onClick={() => onModeChange(candidate)}
            className={cn("px-2.5", mode === candidate ? "text-[var(--text)]" : "text-[var(--text-dim)]")}
          >
            {SESSION_MODE_LABEL[candidate]}
          </Control>
        ))}
        {mode === "executing" && (aside ? onRestore : onSetAside) ? (
          <Control size="sm" variant="text" className="border-l border-[var(--surface-line)] pl-3 text-[var(--text-dim)]" onClick={aside ? onRestore : onSetAside}>
            {aside ? "Restore" : "Set this project aside"}
          </Control>
        ) : null}
      </div>
      <div className="flex items-center gap-2 rounded-[var(--r-pill)] border border-[var(--surface-line)] bg-[var(--surface)] px-3 py-1.5">
        <span className="font-mono text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-dim)]">{SESSION_MODE_LABEL[mode]}</span>
        <Pulse traces={traces} questions={questionKeys} state={activityState} className="h-4 w-14" />
        <span className="font-mono text-[var(--t-count)] text-[var(--text-muted)]">{activityState === "known" ? `${questionKeys.length} ${questionKeys.length === 1 ? "question" : "questions"}` : activityState === "loading" ? "Loading activity" : "Activity unknown"}</span>
      </div>
    </div>
  );
}
