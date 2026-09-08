// Monday 2026-03-23, the first Build week. Derived from the human-authored
// calendar rotation: Marketing 2026-03-30, Ops 2026-04-06, Slack 2026-04-13.
const ANCHOR_DATE = new Date(2026, 2, 23);
const ANCHOR_DAY = calendarDayOrdinal(ANCHOR_DATE);

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
  const daysSinceAnchor = calendarDayOrdinal(now) - ANCHOR_DAY;
  const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
  const rotationIndex = ((weeksSinceAnchor % ROTATION_WEEKS.length) + ROTATION_WEEKS.length) % ROTATION_WEEKS.length;
  const daysElapsed = ((daysSinceAnchor % 7) + 7) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysElapsed);

  return {
    week: ROTATION_WEEKS[rotationIndex],
    weekNumber: rotationIndex + 1,
    daysRemaining: Math.max(1, 7 - daysElapsed),
    weekStart,
    weekEnd: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6),
  };
}

function calendarDayOrdinal(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
