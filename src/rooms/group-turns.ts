/**
 * One member's turn: its persistent per-room session, the run that drives it,
 * and the blocking prompts (approval / clarify) mirrored out of that session
 * so a room surface can answer them.
 *
 * Room-level sequencing lives in `group-rounds.ts`, which drives these.
 *
 * Hermes Desktop's `hermes-bots/group-turns.ts` (MIT) polls `session.resume`
 * because its plugin SDK gives it no event stream. This app holds an open
 * gateway (`src/engine/`), so the same contract — submit, wait for the turn to
 * end, harvest a reply that outlived its deadline — is written on
 * `message.complete` events instead of a poll loop. The behaviour that
 * transfers: a member's session is persistent and per-room, a turn that runs
 * past the deadline is STRANDED rather than lost, and a member's blocking
 * prompt is mirrored into the room instead of parking server-side.
 */

import { request, type GatewayClientLike } from "@/engine/contract";
import type {
  ApprovalRequestPayload,
  ClarifyRequestPayload,
  MessageCompletePayload,
} from "@/engine/contract";
import { createSession, interruptSession, isSessionNotFound, submitPrompt } from "@/engine/session";
import type { ApprovalDecision, ClarifyDecision, ClarifyQuestion } from "@/engine/transcript";

import { clientFor } from "./door";
import { recordGroupActivity } from "./group-activity";
import {
  $groupChats,
  $groupClarify,
  appendGroupChatEntry,
  updateGroupChat,
  type GroupChatRoom,
} from "./group-chat";
import { groupMemberKey } from "./group-membership";
import type { GroupMember } from "./types";

/** How long one member turn may run before it is left STRANDED and the round
 *  moves on. The reply is harvested when it lands. */
export const GROUP_TURN_TIMEOUT_MS = 3 * 60_000;

/** "(pass)" (loosely: pass / (pass) / pass.) or empty = the member stayed
 *  silent. Verbatim from the donor. */
export function isGroupPassText(text: unknown): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed) return true;
  return /^\(?\s*pass\s*\)?\.?$/i.test(trimmed);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The same normalisation the panel's transcript applies, so a room card and
 *  a panel card describe one request identically. */
function clarifyQuestions(payload: ClarifyRequestPayload): ClarifyQuestion[] {
  const rows =
    Array.isArray(payload.questions) && payload.questions.length > 0 ? payload.questions : [payload];
  return rows
    .map((q) => ({
      ...(q.qid ? { qid: q.qid } : {}),
      question: text(q.question),
      choices: Array.isArray(q.choices) ? q.choices.map((c) => text(c)).filter(Boolean) : [],
      multiSelect: q.multi_select === true,
    }))
    .filter((q) => q.question || q.choices.length > 0);
}

/** The live session id for one member of one room, opening it on first use.
 *  Sessions are runtime-only: a fresh app run opens fresh sessions and the
 *  member is re-fed the room delta from its watermark, which is durable. */
export async function ensureGroupChatSession(
  group: string,
  member: GroupMember,
): Promise<{ client: GatewayClientLike; sessionId: string }> {
  const client = clientFor(member);
  const key = groupMemberKey(member);
  const existing = ($groupChats.get()[group]?.sessions || {})[key];
  if (existing) return { client, sessionId: existing };

  const sessionId = await createSession(client, { profile: member.name });
  updateGroupChat(group, (room) => {
    room.sessions = { ...(room.sessions || {}), [key]: sessionId };
    return room;
  });
  return { client, sessionId };
}

/** Forget a member's session so the next turn opens a fresh one. */
function dropGroupChatSession(group: string, member: GroupMember) {
  const key = groupMemberKey(member);
  updateGroupChat(group, (room) => {
    const sessions = { ...(room.sessions || {}) };
    delete sessions[key];
    room.sessions = sessions;
    return room;
  });
}

const clarifyKey = (group: string, member: GroupMember) => `${group}::${groupMemberKey(member)}`;

/** Mirror a member's blocking prompt into the room. Members run in plumbing
 *  sessions no panel shows, so without this the request parks server-side with
 *  no surface to answer it. */
function noteGroupPrompt(
  group: string,
  member: GroupMember,
  sessionId: string,
  thread: null | string,
  decision: ApprovalDecision | ClarifyDecision,
) {
  $groupClarify.set({
    ...$groupClarify.get(),
    [clarifyKey(group, member)]: {
      at: Date.now(),
      group,
      member: member.name,
      memberKey: groupMemberKey(member),
      sessionId,
      thread,
      decision,
    },
  });
}

/** Drop a member's mirrored prompt — it was answered, or its turn ended. */
export function clearGroupPrompt(group: string, member: GroupMember) {
  const key = clarifyKey(group, member);
  const all = $groupClarify.get();
  if (!(key in all)) return;
  const next = { ...all };
  delete next[key];
  $groupClarify.set(next);
}

/** Drop every mirrored prompt for a room (disband, or a stop). */
export function clearGroupClarify(group: string) {
  const all = $groupClarify.get();
  const next = Object.fromEntries(Object.entries(all).filter(([, p]) => p.group !== group));
  if (Object.keys(next).length !== Object.keys(all).length) $groupClarify.set(next);
}

/** Mark a member's turn as still running past its deadline. The round moves on;
 *  `harvestStrandedGroupReply` delivers the reply when it lands. */
function strandMember(group: string, member: GroupMember, before: number, thread: string) {
  updateGroupChat(group, (room) => {
    room.stranded = { ...(room.stranded || {}), [groupMemberKey(member)]: { before, thread } };
    return room;
  });
}

function unstrandMember(group: string, member: GroupMember) {
  updateGroupChat(group, (room) => {
    const stranded = { ...(room.stranded || {}) };
    delete stranded[groupMemberKey(member)];
    room.stranded = stranded;
    return room;
  });
}

/** Replies that landed after their turn was abandoned, keyed by
 *  `${group}::${memberKey}`. Runtime-only: the listener that fills this is the
 *  same one the abandoned turn installed, left running on purpose. */
const lateReplies = new Map<string, string>();

/** Run ONE member's turn and resolve with its reply text, or null when the
 *  member stayed silent, failed, or ran past the deadline (stranded).
 *
 *  A turn is one `prompt.submit` into the member's persistent session, ended by
 *  the `message.complete` for that session. Approval and clarify requests
 *  raised inside the turn are mirrored into the room while it waits, so the
 *  turn genuinely blocks on the user the way the panel does. */
export async function runGroupChatMemberTurn(
  group: string,
  member: GroupMember,
  prompt: string,
  thread: string,
): Promise<null | string> {
  const memberKey = groupMemberKey(member);
  const lateKey = `${group}::${memberKey}`;
  // A reply that landed after a previous turn was abandoned is this member's
  // answer already — deliver it instead of asking the same question again.
  const late = lateReplies.get(lateKey);
  if (late !== undefined) {
    lateReplies.delete(lateKey);
    return late;
  }

  let handle = await ensureGroupChatSession(group, member);

  recordGroupActivity(group, { kind: "working", member: member.name, thread });

  const before = ($groupChats.get()[group]?.log || []).length;

  const runOnce = (client: GatewayClientLike, sessionId: string) =>
    new Promise<null | string>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        unsubscribe();
        clearGroupPrompt(group, member);
        outcome();
      };

      const unsubscribe = client.onAny((event) => {
        if (event.session_id !== sessionId) return;

        if (event.type === "approval.request") {
          const payload = (event.payload ?? {}) as ApprovalRequestPayload;
          const requestId = text(payload.request_id);
          if (!requestId) return;
          noteGroupPrompt(group, member, sessionId, thread, {
            kind: "approval",
            requestId,
            command: text(payload.command),
            description: text(payload.description),
            choices:
              Array.isArray(payload.choices) && payload.choices.length > 0
                ? payload.choices
                : ["once", "deny"],
            messageId: "",
            at: Date.now(),
          });
          return;
        }

        if (event.type === "clarify.request") {
          const payload = (event.payload ?? {}) as ClarifyRequestPayload;
          const requestId = text(payload.request_id);
          const questions = clarifyQuestions(payload);
          if (!requestId || questions.length === 0) return;
          noteGroupPrompt(group, member, sessionId, thread, {
            kind: "clarify",
            requestId,
            questions,
            messageId: "",
            at: Date.now(),
          });
          return;
        }

        if (event.type !== "message.complete") return;
        const payload = (event.payload ?? {}) as MessageCompletePayload;
        const reply = text(payload.text).trim();

        if (settled) {
          // The turn was abandoned as stranded and this listener was left in
          // place on purpose: keep the reply so it is late, never lost.
          if (payload.status !== "error" && reply) lateReplies.set(lateKey, reply);
          unsubscribe();
          return;
        }
        if (payload.status === "error") {
          const reason = text(payload.error).trim() || reply || "Hermes reported an error";
          finish(() => reject(new Error(reason)));
          return;
        }
        // An interrupted turn is silence, not a room error.
        finish(() => resolve(payload.status === "interrupted" ? null : reply));
      });

      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        clearGroupPrompt(group, member);
        // Deliberately NOT unsubscribing: the listener above now runs in its
        // settled branch and parks the reply for the harvest.
        strandMember(group, member, before, thread);
        recordGroupActivity(group, { kind: "timed-out", member: member.name, thread });
        resolve(null);
      }, GROUP_TURN_TIMEOUT_MS);

      submitPrompt(client, sessionId, prompt).catch((error: unknown) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
    });

  try {
    return await runOnce(handle.client, handle.sessionId);
  } catch (error) {
    // Hermes forgot the session (a restart, a sweep): open a fresh one once.
    if (!isSessionNotFound(error)) throw error;
    dropGroupChatSession(group, member);
    handle = await ensureGroupChatSession(group, member);
    return runOnce(handle.client, handle.sessionId);
  }
}

/** Deliver a reply that landed after its turn was abandoned. Appends it to the
 *  room in the thread the turn belonged to and clears the stranded marker.
 *  Returns true when something was delivered. */
export async function harvestStrandedGroupReply(
  group: string,
  member: GroupMember,
): Promise<boolean> {
  const memberKey = groupMemberKey(member);
  const marker = ($groupChats.get()[group]?.stranded || {})[memberKey];
  if (marker === undefined) return false;

  const lateKey = `${group}::${memberKey}`;
  const reply = lateReplies.get(lateKey);
  if (reply === undefined) return false; // still running; the next pass retries

  lateReplies.delete(lateKey);
  unstrandMember(group, member);

  const thread = typeof marker === "object" && marker.thread ? marker.thread : "legacy";
  if (isGroupPassText(reply)) {
    recordGroupActivity(group, { kind: "passed", member: member.name, thread });
    return false;
  }

  appendGroupChatEntry(group, { kind: "member", name: member.name }, reply, thread);
  updateGroupChat(group, (room: GroupChatRoom) => {
    room.watermarks[`${thread}::${memberKey}`] = room.log.length;
    return room;
  });
  recordGroupActivity(group, { kind: "delivered", member: member.name, thread });
  return true;
}

/** Interrupt whatever a member is doing right now, best effort. */
export async function interruptGroupMember(group: string, member: GroupMember): Promise<void> {
  const sessionId = ($groupChats.get()[group]?.sessions || {})[groupMemberKey(member)];
  if (!sessionId) return;
  try {
    await interruptSession(clientFor(member), sessionId);
  } catch {
    /* best effort — the epoch bump and holds already stopped the room */
  }
}

/** Answer a member's mirrored approval request. */
export async function respondGroupApproval(
  group: string,
  member: GroupMember,
  requestId: string,
  choice: ApprovalDecision["choices"][number],
): Promise<void> {
  const sessionId = ($groupChats.get()[group]?.sessions || {})[groupMemberKey(member)];
  if (!sessionId) return;
  await request(clientFor(member), "approval.respond", {
    session_id: sessionId,
    request_id: requestId,
    choice,
  });
  clearGroupPrompt(group, member);
}

/** Tests: drop every parked late reply. */
export function resetLateRepliesForTests() {
  lateReplies.clear();
}

/** Tests: park a late reply as if a stranded turn had just landed. */
export function setLateReplyForTests(group: string, memberKey: string, reply: string) {
  lateReplies.set(`${group}::${memberKey}`, reply);
}
