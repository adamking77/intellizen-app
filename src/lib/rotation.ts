const DAY_MS = 24 * 60 * 60 * 1000;
// Monday 2026-03-23, the first Build week. Derived from the only human-authored
// record of the rotation: calendar events Marketing 2026-03-30, Ops 2026-04-06,
// Slack 2026-04-13. The previous anchor (2026-04-13) mislabelled all three.
// Month is 0-indexed: 2 = March.
const ANCHOR_DATE = new Date(2026, 2, 23);

export const ROTATION_WEEKS = ["Build", "Marketing", "Ops", "Slack"] as const;

export type RotationWeek = (typeof ROTATION_WEEKS)[number];

export interface RotationState {
  week: RotationWeek;
  weekNumber: number;
  daysRemaining: number;
  weekStart: Date;
  weekEnd: Date;
}

export function currentRotation(now = new Date()): RotationState {
  const anchor = startOfDay(ANCHOR_DATE);
  const today = startOfDay(now);
  const daysSinceAnchor = Math.floor((today.getTime() - anchor.getTime()) / DAY_MS);
  const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
  const rotationIndex = ((weeksSinceAnchor % ROTATION_WEEKS.length) + ROTATION_WEEKS.length) % ROTATION_WEEKS.length;
  const weekStart = new Date(anchor.getTime() + weeksSinceAnchor * 7 * DAY_MS);
  const daysElapsed = Math.max(0, Math.floor((today.getTime() - weekStart.getTime()) / DAY_MS));

  return {
    week: ROTATION_WEEKS[rotationIndex],
    weekNumber: rotationIndex + 1,
    daysRemaining: Math.max(1, 7 - daysElapsed),
    weekStart,
    weekEnd: new Date(weekStart.getTime() + 6 * DAY_MS),
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
