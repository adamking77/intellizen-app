/** Room actions execute in the main window, even when their view is detached. */
import { useSessionStore } from "@/engine/session-store";
import { $groupChats, $groupClarify, type GroupChatRoom } from "@/rooms/group-chat";
import { clearGroupPrompt, respondGroupApproval } from "@/rooms/group-turns";
import { currentGroupActivity, type GroupActivityEntry } from "@/rooms/group-activity";
import { approveHostedRoom, refreshHostedRoom, sendHostedRoom, stopHostedRoom } from "@/rooms/hermes-hosted";
import { sendToGroupChat, stopGroupThread } from "@/rooms/group-rounds";
import { answerClarify } from "@/engine/decisions";
import { clientFor } from "@/rooms/door";
import type { GroupPrompt } from "@/rooms/types";
import type { ApprovalChoice } from "@/engine/contract";
import { clearPanelDraft, readPanelDraft } from "./panel-draft";
import { loadTeams } from "@/components/agents/teams-store";
import { openTeamRoom } from "@/rooms/team-room";
import { readConversationContext, type ConversationContextSnapshot } from "@/lib/conversation-context";
import { groupMemberKey } from "@/rooms/group-membership";

export interface PanelRoomSnapshot {
  id: string;
  room: GroupChatRoom | null;
  pending: GroupPrompt | null;
  activity: GroupActivityEntry[];
}

export interface RoomSendReceipt {
  messageId: string;
  thread: string;
}

export type PanelRoomAction =
  | { type: "room-send"; roomId: string; text: string; context?: ConversationContextSnapshot | null; preservePanelDraft?: boolean }
  | { type: "room-stop"; roomId: string }
  | { type: "room-refresh"; roomId: string }
  | { type: "room-approve"; roomId: string; memberKey: string; requestId: string; choice: ApprovalChoice; receiptId?: string }
  | { type: "room-clarify"; roomId: string; memberKey: string; requestId: string; answers: Record<string, string[]>; receiptId?: string }
  | { type: "select-team"; teamId: string };

export function roomSnapshot(id: string | null): PanelRoomSnapshot | null {
  if (!id) return null;
  const room = $groupChats.get()[id];
  return { id, room: room && !room.tombstone ? room : null,
    pending: Object.values($groupClarify.get()).find((prompt) => prompt.group === id) ?? null,
    activity: currentGroupActivity(id) };
}

const roomDecisions = new Set<string>();

export async function runRoomAction(action: PanelRoomAction): Promise<RoomSendReceipt | void> {
  if (action.type === "select-team") {
    const team = (await loadTeams()).find((item) => item.id === action.teamId);
    if (!team) throw new Error("That team is no longer available.");
    const id = await openTeamRoom(team, useSessionStore.getState().profileDirectory);
    useSessionStore.getState().selectRoom(id);
    return;
  }
  const snapshot = roomSnapshot(action.roomId), room = snapshot?.room;
  if (!room) throw new Error("That room is no longer available.");
  const id = action.roomId, members = room.members ?? [];
  if (action.type === "room-refresh") { await refreshHostedRoom(id); return; }
  if (action.type === "room-send") {
    if (!action.text.trim()) return;
    const context = action.context === undefined ? readConversationContext() : action.context;
    const key = `room:${id}`, draft = action.preservePanelDraft ? null : readPanelDraft(key);
    let receipt: RoomSendReceipt | null = null;
    if (room.owner === "hermes") {
      const sent = await sendHostedRoom(id, action.text, undefined, context);
      receipt = { messageId: sent.eventId, thread: sent.threadId };
    } else {
      const thread = await sendToGroupChat(id, members, action.text, null, context);
      const sent = [...($groupChats.get()[id]?.log ?? [])].reverse().find((message) =>
        message.from.kind === "user" && message.thread === thread,
      );
      if (sent?.id && thread) receipt = { messageId: sent.id, thread };
    }
    if (draft?.text.trim() === action.text.trim()) clearPanelDraft(key, draft);
    if (!receipt) throw new Error("The room accepted the question without a readable message receipt.");
    return receipt;
  }
  if (action.type === "room-stop") {
    if (room.owner === "hermes") await stopHostedRoom(id);
    else await stopGroupThread(id, null, members);
    return;
  }
  const pending = snapshot.pending;
  if (!pending || pending.memberKey !== action.memberKey || pending.decision.requestId !== action.requestId) {
    throw new Error("That request is no longer pending.");
  }
  if (roomDecisions.has(id)) throw new Error("Another answer is already being sent for this room.");
  const member = members.find((item) => groupMemberKey(item) === pending.memberKey);
  if (!member) throw new Error("The requesting member is no longer in this room.");
  roomDecisions.add(id);
  try {
    if (action.type === "room-approve") {
      if (pending.decision.kind !== "approval") throw new Error("This request is not an approval.");
      if (pending.hosted) await approveHostedRoom(id, pending, action.choice);
      else await respondGroupApproval(id, member, action.requestId, action.choice);
    } else {
      if (pending.decision.kind !== "clarify") throw new Error("This request does not accept answers.");
      await answerClarify(clientFor(member), pending.decision, action.answers);
      clearGroupPrompt(id, member);
    }
  } finally {
    roomDecisions.delete(id);
  }
}
