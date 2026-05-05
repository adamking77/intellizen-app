const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR_DATE = new Date(2026, 3, 13);

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
