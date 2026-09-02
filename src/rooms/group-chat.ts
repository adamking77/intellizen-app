/**
 * The group-chat room store: the room atoms, the durable record, and the
 * small pure helpers every room surface shares (identity, thread ids, entry
 * append, the #93127 decision predicates).
 *
 * Vendored from Hermes Desktop `hermes-bots/group-chat.ts` (MIT): the pure
 * half, verbatim where it is pure. Rooms are keyed by roomId here (the donor
 * keys by display name); the cross-client ui_meta sync projection is not
 * carried over — one machine, one store, files on disk.
 */

import { persistRoom } from "./persist";
import { atom } from "./store";
import type { GroupChat, GroupHold, GroupMember, GroupMessage, GroupMessageAuthor, GroupPrompt } from "./types";

/** Group-chat rooms, by roomId: { log, watermarks, epoch, running, … }.
 *  Log + watermarks + holds + members persist; epoch/running/turn/sessions
 *  are runtime-only. */
export const $groupChats = atom<Record<string, GroupChatRoom>>({});
/** Rooms whose latest activity mentions @user — the needs-you badge. */
export const $groupNeedsYou = atom<Record<string, boolean>>({});
/** Pending prompts (clarify questions AND command approvals) raised inside
 *  member sessions, keyed `${group}::${memberKey}`. Members run in plumbing
 *  sessions no panel shows, so a member's blocking prompt would otherwise
 *  park server-side with no surface to answer it. */
export const $groupClarify = atom<Record<string, GroupPrompt>>({});

// ── one room's budget ────────────────────────────────────────────────────────
// Every ceiling a single user send can spend, in one block on purpose. Same
// values Hermes Desktop ships.
export const GROUP_CHAT_MAX_ROUNDS = 3;
export const GROUP_CHAT_MAX_MESSAGES = 10;
export const GROUP_CHAT_MAX_CONTINUATIONS = 2;
export const GROUP_CHAT_HISTORY_LIMIT = 24;
export const GROUP_CHAT_MAX_MEMBERS = 6;
export const GROUP_CHAT_MIN_MEMBERS = 2;

/** Transcript form of a room speaker's name. Friendly identity wins: a title
 *  or display name labels the speaker everywhere this helper feeds — the
 *  "X is thinking…" line, the activity feed, and transcript lines. The
 *  untitled primary profile is literally named "default" — render it as
 *  Hermes (matching the @hermes handle). */
export function groupSpeakerLabel(name?: null | string, members?: GroupMember[]): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return trimmed;
  const pool = members ?? Object.values($groupChats.get()).flatMap((room) => room.members || []);
  const member = pool.find((m) => m.name === trimmed);
  const title = String(member?.title || member?.display_name || "").trim();
  if (title) return title;
  return trimmed.toLowerCase() === "default" ? "Hermes" : trimmed;
}

/** Trim a room log + its watermarks to the retained window, keeping
 *  watermark indices consistent with the trimmed array. */
export function trimGroupChatLog(
  log: GroupMessage[],
  watermarks: Record<string, number>,
  limit = GROUP_CHAT_HISTORY_LIMIT * 4,
) {
  if (log.length <= limit) {
    return { log, watermarks };
  }

  const drop = log.length - limit;
  const trimmed: Record<string, number> = {};

  for (const [name, index] of Object.entries(watermarks || {})) {
    trimmed[name] = Math.max(0, index - drop);
  }

  return { log: log.slice(drop), watermarks: trimmed };
}

/** The durable part of a room record: what `$APP_DATA/rooms/<id>.json` holds. */
export function durableGroupChat(room: GroupChat): GroupChat {
  return {
    roomId: typeof room.roomId === "string" && room.roomId ? room.roomId : null,
    name: room.name || "",
    createdAt: room.createdAt || 0,
    log: room.log,
    watermarks: room.watermarks || {},
    // Sticky per-member stop holds. Watermarks persist, so holds must too —
    // otherwise a restart silently releases a member the user stopped.
    holds: room.holds || {},
    members: Array.isArray(room.members) ? room.members : [],
  };
}

/** Mutate one group's room state through the atom + persist the durable part. */
export function updateGroupChat(group: string, mutate: (room: GroupChatRoom) => GroupChatRoom): GroupChatRoom {
  const all = { ...$groupChats.get() };

  const current: GroupChatRoom = all[group] || {
    roomId: group,
    log: [],
    watermarks: {},
    epoch: 0,
    running: false,
  };

  const next = mutate({
    ...current,
    log: [...current.log],
    watermarks: { ...current.watermarks },
  });

  const bounded = trimGroupChatLog(next.log, next.watermarks);
  next.log = bounded.log;
  next.watermarks = bounded.watermarks;
  all[group] = next;
  $groupChats.set(all);

  // Disband tombstones are runtime-only coordination state (they hold the
  // epoch bump for an in-flight drive); never written to disk.
  if (!next.tombstone) persistRoom(group, durableGroupChat(next));

  return next;
}

/** A #93129 member hold as this file mints it. `GroupHold` models only the
 *  two fields that survive a reload; the live stamp also records WHICH user
 *  message, in which thread, put the member on hold. */
export interface GroupHoldStamp extends GroupHold {
  byMessageId?: null | string;
  thread?: null | string;
}

/** The room record as the coordination engine handles it: `GroupChat` plus
 *  `turn`, the runtime-only name of the member currently mid-turn. */
export interface GroupChatRoom extends GroupChat {
  holds?: Record<string, GroupHoldStamp>;
  turn?: null | string;
}

function groupChatEntryId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The agent loop's "(empty)" terminal sentinel is a FAILURE marker, never
 *  bot text. Mirror gateway/run.py's user-friendly substitution so the room
 *  log never shows the raw sentinel. */
const GROUP_EMPTY_SENTINEL = "(empty)";

const GROUP_EMPTY_FRIENDLY =
  "The model returned no response after processing tool results. " +
  "This can happen with some models — try again or rephrase your question.";

function normalizeGroupChatText(text: string): string {
  const trimmed = String(text || "").trim();

  return trimmed === GROUP_EMPTY_SENTINEL ? GROUP_EMPTY_FRIENDLY : trimmed;
}

export function appendGroupChatEntry(
  group: string,
  from: GroupMessageAuthor,
  text: string,
  thread?: null | string,
): GroupMessage {
  const entry: GroupMessage = {
    id: groupChatEntryId(),
    at: Date.now(),
    from,
    text: normalizeGroupChatText(text),
    thread: thread || "legacy",
  };

  // #93127 insurance: a residual double-append path (stale loop + fresh
  // loop both committing the same member reply) lands back-to-back and
  // byte-identical. Drop the echo instead of flooding the room.
  const priorLog = ($groupChats.get()[group] || {}).log || [];
  const lastEntry = priorLog[priorLog.length - 1];

  if (isDuplicateGroupAppend(lastEntry, from, entry.text, entry.thread)) {
    return lastEntry;
  }

  updateGroupChat(group, (room) => {
    room.log.push(entry);

    return room;
  });

  // Needs-you: a member addressing @user badges the room.
  if (from.kind === "member" && /@user\b/i.test(entry.text)) {
    $groupNeedsYou.set({ ...$groupNeedsYou.get(), [group]: true });
  }

  return entry;
}

/** Fresh room identity. Independent of the editable display name: a
 *  disbanded-and-recreated room mints a new roomId even when the display
 *  name is identical, so member sessions never resume by title. */
export function mintGroupRoomId(): string {
  return `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Unique display name for a NEW room. Collisions get a " 2", " 3", …
 *  suffix; the BASE is truncated (never the joined string). */
export function uniqueGroupChatName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }

  for (let n = 2; n < 100; n++) {
    const suffix = ` ${n}`;
    const candidate = base.slice(0, 64 - suffix.length) + suffix;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("No free name for the room.");
}

// --- room-turn decision helpers (#93127) — pure, unit-tested ---

/** #93127: whether a finished member turn may still commit (append its reply
 *  and advance its watermark). A turn dispatched under an older epoch was
 *  superseded mid-flight by a newer user send — its late result must be
 *  dropped, because the new send's own loop re-drives this member with the
 *  full delta and committing both is exactly the double-delivery bug.
 *
 *  The re-drive premise is only true for a send in the SAME thread: a
 *  cross-thread epoch bump must NOT discard finished work no fresh loop will
 *  regenerate. */
export function shouldCommitMemberTurn(epochAtDispatch: number, currentEpoch: number, newerUserEntryInThread = true) {
  if (epochAtDispatch === currentEpoch) {
    return true;
  }

  return !newerUserEntryInThread;
}

/** #93127 insurance: byte-identical member echo detection. TRUE only when
 *  the immediately-preceding log entry has the same author, same thread, and
 *  identical text, within a short recency window. */
const GROUP_DUPLICATE_APPEND_WINDOW_MS = 10 * 60 * 1000;

function isDuplicateGroupAppend(
  lastEntry: GroupMessage | undefined,
  from: GroupMessageAuthor,
  text: string,
  thread: null | string | undefined,
  now = Date.now(),
): boolean {
  if (!lastEntry || !from || from.kind !== "member" || lastEntry.from?.kind !== "member") {
    return false;
  }

  if (String(lastEntry.from?.name || "") !== String(from.name || "")) {
    return false;
  }

  if (String(lastEntry.from?.source || "") !== String(from.source || "")) {
    return false;
  }

  if (String(lastEntry.thread || "legacy") !== String(thread || "legacy")) {
    return false;
  }

  if (now - (lastEntry.at || 0) > GROUP_DUPLICATE_APPEND_WINDOW_MS) {
    return false;
  }

  return String(lastEntry.text || "") === String(text || "").trim();
}

// --- end room-turn decision helpers ---

export function groupThreadOf(entry: GroupMessage): string {
  return entry?.thread || "legacy";
}

export function mintGroupThreadId(): string {
  return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Pre-thread logs get synthetic thread ids: a user entry after a real lull
// starts one, so multi-turn tasks stay whole instead of splitting on every
// follow-up.
const GROUP_THREAD_GAP_MS = 15 * 60000;

export function assignLegacyThreads(log: GroupMessage[]): GroupMessage[] {
  let current: null | string = null;
  let n = 0;

  return (log || []).map((entry, i) => {
    if (entry?.thread) {
      current = null;

      return entry;
    }

    const prev = log[i - 1];
    const lull = !prev || (entry.at || 0) - (prev.at || 0) > GROUP_THREAD_GAP_MS;

    if (!current || (entry.from?.kind === "user" && lull)) {
      current = `legacy-${n++}`;
    }

    return { ...entry, thread: current };
  });
}
