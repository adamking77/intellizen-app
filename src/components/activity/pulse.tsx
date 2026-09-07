import { cn } from "@/lib/utils";

export interface PulseTrace {
  id: string;
  color?: string;
  label?: string;
  state?: string;
}

/** A quiet, data-shaped trace that drifts only for real active work. */
export function Pulse({ traces = [], questions = [], state = "known", className }: { traces?: PulseTrace[]; questions?: string[]; state?: "known" | "loading" | "unknown"; className?: string }) {
  const width = 640;
  const paths = state === "known" ? traces : [];
  const pendingQuestions = state === "known" ? questions : [];
  if (state === "known" && paths.length === 0 && pendingQuestions.length === 0) return null;
  const label = state === "loading"
    ? "Activity is loading"
    : state === "unknown"
      ? "Activity is unavailable"
      : `${paths.length} active ${paths.length === 1 ? "item" : "items"}${pendingQuestions.length ? ` and ${pendingQuestions.length} pending ${pendingQuestions.length === 1 ? "question" : "questions"}` : ""}`;
  return (
    <svg
      viewBox={`0 0 ${width} 56`}
      role="img"
      aria-label={label}
      className={cn("h-14 w-full max-w-[760px] overflow-hidden", className)}
    >
      {paths.map((trace, index) => {
        const y = 28 + (index - (paths.length - 1) / 2) * Math.min(5, 40 / Math.max(1, paths.length - 1));
        const wave = 5 + index * 2;
        const d = `M0 ${y} C80 ${y - wave}, 100 ${y - wave}, 160 ${y} S240 ${y + wave}, 320 ${y} S400 ${y - wave}, 480 ${y} S560 ${y + wave}, ${width} ${y}`;
        return <g key={trace.id} className="pulse-trace">
          <path d={d} fill="none" stroke={trace.color || "var(--text-dim)"} strokeWidth="1.15" opacity="0.8" />
          <path d={d} transform={`translate(${width} 0)`} fill="none" stroke={trace.color || "var(--text-dim)"} strokeWidth="1.15" opacity="0.8" />
        </g>;
      })}
      {pendingQuestions.map((question, index) => <circle key={question} cx={pendingQuestions.length === 1 ? width / 2 : 24 + index * ((width - 48) / (pendingQuestions.length - 1))} cy="28" r="3.5" fill="var(--surface)" stroke="var(--question)" strokeWidth="2" />)}
    </svg>
  );
}
