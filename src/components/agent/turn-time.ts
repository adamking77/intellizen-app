// How long a turn took and when it happened, as a person would say it.
// Ported from hermes-app `src/took.ts` and `src/clock.ts`.

export function took(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 10) return "a few seconds";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** "Done in 12 s" for the run status line: seconds until a minute, then m s. */
export function doneIn(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} m ${rest} s` : `${m} m`;
}

function calendar(then: Date, now: Date): string {
  const time = then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (then.getTime() >= midnight) return time;
  if (then.getTime() >= midnight - 86_400_000) return `Yesterday ${time}`;
  const day = then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

/** Relative inside the hour, the clock after it. */
export function clock(at: number, now: number = Date.now()): string {
  const secs = Math.round((now - at) / 1000);
  if (secs < 45) return "now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return calendar(new Date(at), new Date(now));
}
