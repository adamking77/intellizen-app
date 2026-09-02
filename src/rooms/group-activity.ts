/**
 * The per-room activity feed: a bounded, runtime-only record of turn events
 * for the room view's Activity list. Vendored from Hermes Desktop
 * `hermes-bots/group-activity.ts` (MIT); tones are tokens, not classes.
 */

import { $groupChats, groupSpeakerLabel } from "./group-chat";
import { atom } from "./store";
import type { GroupActivityEvent, GroupActivityKind } from "./types";

// Runtime-only, bounded per-room record of turn events. Never persisted — it
// is presentation state like running/epoch; the room log stays the only
// durable record. Every event is tagged with the room epoch it belongs to,
// so the view shows only the CURRENT run.
const GROUP_ACTIVITY_LIMIT = 50;

/** A recorded activity row: the caller's event tagged with the room epoch. */
export interface GroupActivityEntry extends Omit<GroupActivityEvent, "group" | "member"> {
  epoch: number;
  member?: null | string;
  thread?: null | string;
}
export const $groupActivity = atom<Record<string, { events: GroupActivityEntry[] }>>({});

export function recordGroupActivity(group: string, event: Omit<GroupActivityEntry, "at" | "epoch">) {
  const room = $groupChats.get()[group];

  if (!room) {
    return null;
  }

  const current = $groupActivity.get()[group] || { events: [] };

  const entry = { at: Date.now(), epoch: room.epoch || 0, ...event };

  const events = [...current.events, entry].slice(-GROUP_ACTIVITY_LIMIT);
  $groupActivity.set({ ...$groupActivity.get(), [group]: { ...current, events } });

  return entry;
}

/** Events for the room's CURRENT run — superseded runs (epoch moved on)
 *  are dropped from view instead of describing work that already ended. */
export function currentGroupActivity(group: string): GroupActivityEntry[] {
  const epoch = ($groupChats.get()[group] || {}).epoch || 0;

  return ($groupActivity.get()[group] || {}).events?.filter((event) => (event.epoch || 0) === epoch) || [];
}

/** Human label for one activity event. */
export function groupActivityLabel(event: GroupActivityEntry) {
  const kind = event?.kind;
  const base = GROUP_ACTIVITY_LABELS[kind] || kind || "did something";

  if (kind === "cancelled" || kind === "settled" || kind === "capped") {
    return base;
  }

  const who = event?.member === "You" ? "You" : groupSpeakerLabel(event?.member || "A member");

  return `${who} ${base}`;
}

const GROUP_ACTIVITY_LABELS: Record<GroupActivityKind, string> = {
  queued: "sent a message",
  working: "is working…",
  replied: "replied",
  passed: "passed",
  "timed-out": "took too long",
  failed: "hit an error",
  cancelled: "turn interrupted by a newer message",
  settled: "turn settled",
  capped: "turn stopped at the round/message cap",
  delivered: "delivered a late reply",
  held: "is held (stopped by you) — @mention it or say resume to release",
  stopped: "stopped the room — remaining turns are held until resumed",
};

/** Text tone for an activity row, as a token: quiet for pass/cancel/settle,
 *  accent for work and real replies, bad for failures and timeouts. */
export function groupActivityTone(kind: GroupActivityKind): string {
  if (kind === "failed" || kind === "timed-out") {
    return "var(--bad)";
  }

  if (kind === "working" || kind === "replied" || kind === "delivered") {
    return "var(--accent)";
  }

  return "var(--text-muted)";
}
