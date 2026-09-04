import { request, type ApprovalChoice, type GatewayClientLike } from "@/engine/contract";
import { getGatewayClient } from "@/engine/gateway";

import { $groupChats, $groupClarify, $groupNeedsYou, updateGroupChat, type GroupChatRoom } from "./group-chat";
import { botHandle, durableGroupChatMembers, groupMemberKey } from "./group-membership";
import type { GroupActivityEvent, GroupActivityKind, GroupMember, GroupMessage, GroupPrompt, RoomOwner } from "./types";

const REQUIRED = [
  "groups.list",
  "groups.create",
  "groups.state",
  "groups.send",
  "groups.log",
  "groups.disband",
  "groups.stop",
  "groups.approve",
] as const;

interface HostedMember {
  member_id: string;
  profile: string;
  handle: string;
  display_name?: string;
  target?: { kind?: string; profile?: string };
}

interface HostedRoom {
  room_id: string;
  name: string;
  members: HostedMember[];
  created_at?: number;
  latest_seq?: number;
}

interface HostedEvent {
  seq: number;
  event_id: string;
  kind: string;
  actor?: { kind?: string; id?: string; profile?: string };
  payload?: Record<string, unknown>;
  created_at?: number;
}

interface HostedAction {
  kind?: string;
  member_id?: string;
  task_id?: string;
  execution_generation?: number;
  session_id?: string;
  request_id?: string;
  approval?: { command?: string; description?: string };
}

interface HostedStateResult {
  room?: HostedRoom;
  driver_status?: {
    working?: boolean;
    pending_actions?: HostedAction[];
  };
}

interface HostedLogResult {
  events?: HostedEvent[];
  cursor?: number;
  latest_seq?: number;
  has_more?: boolean;
}

export function roomOwnerFor(members: GroupMember[]): RoomOwner {
  return members.some((member) => member.door === "acp") ? "local" : "hermes";
}

function hostedRoster(members: GroupMember[]): HostedMember[] {
  return durableGroupChatMembers(members).map((member) => ({
    member_id: groupMemberKey(member),
    profile: member.name,
    handle: botHandle(member.name, member),
    target: { kind: "local", profile: member.name },
    ...(member.display_name || member.title
      ? { display_name: member.title || member.display_name }
      : {}),
  }));
}

function localMembers(room: HostedRoom, cached?: GroupChatRoom): GroupMember[] {
  const prior = new Map((cached?.members || []).map((member) => [member.name, member]));
  return room.members.map((member) => ({
    ...prior.get(member.profile),
    name: member.profile,
    door: "gateway",
    handle: member.handle,
    ...(member.display_name ? { display_name: member.display_name } : {}),
  }));
}

function messageFromEvent(event: HostedEvent, members: GroupMember[]): GroupMessage | null {
  if (event.kind !== "message.user" && event.kind !== "message.member") return null;
  const text = typeof event.payload?.text === "string" ? event.payload.text.trim() : "";
  if (!text) return null;
  const memberId = typeof event.payload?.member_id === "string" ? event.payload.member_id : "";
  const member = members.find((candidate) => groupMemberKey(candidate) === memberId);
  return {
    id: event.event_id,
    at: Math.round(Number(event.created_at || 0) * 1000),
    from:
      event.kind === "message.user"
        ? { kind: "user", name: "You" }
        : { kind: "member", name: member?.name || event.actor?.profile || memberId },
    text,
    thread: typeof event.payload?.thread_id === "string" ? event.payload.thread_id : "legacy",
  };
}

function activityFromEvent(
  roomId: string,
  event: HostedEvent,
  members: GroupMember[],
): GroupActivityEvent | null {
  const memberId = typeof event.payload?.member_id === "string" ? event.payload.member_id : "";
  const member = members.find((candidate) => groupMemberKey(candidate) === memberId)?.name;
  let kind: GroupActivityKind | null = null;
  if (event.kind === "message.user") kind = "queued";
  else if (event.kind === "message.member") kind = "replied";
  else if (event.kind === "turn.failed") kind = "failed";
  else if (event.kind === "turn.deferred") kind = "held";
  else if (event.kind === "turn.settled") kind = event.payload?.passed === true ? "passed" : "settled";
  else if (event.kind === "room.stop_requested") kind = "stopped";
  else if (event.kind === "room.activity") kind = event.payload?.status === "bounded" ? "capped" : "settled";
  if (!kind) return null;
  const reason = [event.payload?.error, event.payload?.reason, event.payload?.reason_code]
    .find((value): value is string => typeof value === "string" && value.length > 0);
  return {
    at: Math.round(Number(event.created_at || 0) * 1000),
    group: roomId,
    kind,
    ...(event.kind === "message.user" ? { member: "You" } : member ? { member } : {}),
    ...(reason ? { reason } : {}),
  };
}

async function requireHostedRooms(client: GatewayClientLike): Promise<void> {
  const result = await request<{ driver?: boolean; methods?: string[] }>(client, "groups.capabilities");
  const methods = new Set(Array.isArray(result.methods) ? result.methods : []);
  if (result.driver !== true || REQUIRED.some((method) => !methods.has(method))) {
    throw new Error("Hermes durable rooms are unavailable.");
  }
}

function applyPendingApproval(roomId: string, state: HostedStateResult): void {
  const action = state.driver_status?.pending_actions?.find(
    (candidate) =>
      candidate.kind === "approval" &&
      candidate.member_id &&
      candidate.task_id &&
      candidate.request_id,
  );
  const prompts = { ...$groupClarify.get() };
  for (const key of Object.keys(prompts)) {
    if (prompts[key].group === roomId && prompts[key].hosted) delete prompts[key];
  }
  if (action) {
    const member = ($groupChats.get()[roomId]?.members || []).find(
      (candidate) => groupMemberKey(candidate) === action.member_id,
    );
    const command = action.approval?.command || action.approval?.description || "Agent action";
    prompts[`${roomId}::${action.member_id}`] = {
      at: Date.now(),
      group: roomId,
      member: member?.name || action.member_id!,
      memberKey: action.member_id!,
      sessionId: action.session_id || "",
      thread: null,
      decision: {
        kind: "approval",
        requestId: action.request_id!,
        command,
        description: action.approval?.description || command,
        choices: ["once", "deny"],
        messageId: action.task_id!,
        at: Date.now(),
      },
      hosted: {
        memberId: action.member_id!,
        taskId: action.task_id!,
        executionGeneration: Number(action.execution_generation || 0),
      },
    };
  }
  $groupClarify.set(prompts);
}

export async function refreshHostedRoom(
  roomId: string,
  client: GatewayClientLike = getGatewayClient(),
): Promise<GroupChatRoom> {
  const state = await request<HostedStateResult>(client, "groups.state", { room_id: roomId });
  if (!state.room) throw new Error("Hermes did not return the room.");
  const current = $groupChats.get()[roomId];
  const members = localMembers(state.room, current);
  let cursor = current?.synced === true && typeof current.remoteCursor === "number" ? current.remoteCursor : 0;
  const messages: GroupMessage[] = cursor > 0 ? [...(current?.log || [])] : [];
  const activity = cursor > 0 ? [...(current?.activity || [])] : [];
  let mentionedUser = false;
  do {
    const page = await request<HostedLogResult>(client, "groups.log", {
      room_id: roomId,
      since_seq: cursor,
      limit: 100,
    });
    for (const event of page.events || []) {
      const message = messageFromEvent(event, members);
      if (message) {
        messages.push(message);
        if (message.from.kind === "member" && /@user\b/i.test(message.text)) mentionedUser = true;
      }
      const receipt = activityFromEvent(roomId, event, members);
      if (receipt) activity.push(receipt);
    }
    cursor = Number(page.cursor || cursor);
    if (!page.has_more) break;
  } while (true);

  const next = updateGroupChat(roomId, (room) => ({
    ...room,
    roomId,
    name: state.room!.name,
    createdAt: Math.round(Number(state.room!.created_at || 0) * 1000),
    owner: "hermes",
    members,
    log: messages,
    activity: activity.slice(-50),
    remoteCursor: cursor,
    running: state.driver_status?.working === true,
    synced: true,
    syncError: null,
  }));
  if (mentionedUser) $groupNeedsYou.set({ ...$groupNeedsYou.get(), [roomId]: true });
  applyPendingApproval(roomId, state);
  return next;
}

export async function refreshHostedRooms(
  client: GatewayClientLike = getGatewayClient(),
): Promise<void> {
  await requireHostedRooms(client);
  let offset = 0;
  do {
    const result = await request<{ rooms?: HostedRoom[]; next_offset?: number | null }>(
      client,
      "groups.list",
      { limit: 100, offset },
    );
    const rooms = Array.isArray(result.rooms) ? result.rooms : [];
    for (const hosted of rooms) {
      const cached = $groupChats.get()[hosted.room_id];
      updateGroupChat(hosted.room_id, (room) => ({
        ...room,
        roomId: hosted.room_id,
        name: hosted.name,
        createdAt: Math.round(Number(hosted.created_at || 0) * 1000),
        owner: "hermes",
        members: localMembers(hosted, cached),
        synced: false,
        syncError: null,
      }));
      await refreshHostedRoom(hosted.room_id, client);
    }
    if (typeof result.next_offset !== "number") break;
    offset = result.next_offset;
  } while (true);
}

export async function createHostedRoom(
  roomId: string,
  name: string,
  members: GroupMember[],
  client: GatewayClientLike = getGatewayClient(),
): Promise<void> {
  await requireHostedRooms(client);
  await request(client, "groups.create", {
    room_id: roomId,
    name,
    members: hostedRoster(members),
  });
  await refreshHostedRoom(roomId, client);
}

export async function sendHostedRoom(
  roomId: string,
  text: string,
  client: GatewayClientLike = getGatewayClient(),
): Promise<void> {
  await request(client, "groups.send", {
    room_id: roomId,
    event_id: `iz-${crypto.randomUUID()}`,
    payload: { text, thread_id: `t-${crypto.randomUUID()}` },
  });
  await refreshHostedRoom(roomId, client);
}

export async function stopHostedRoom(
  roomId: string,
  client: GatewayClientLike = getGatewayClient(),
): Promise<void> {
  await request(client, "groups.stop", { room_id: roomId, cancel_id: `iz-stop-${crypto.randomUUID()}` });
  await refreshHostedRoom(roomId, client);
}

export async function approveHostedRoom(
  roomId: string,
  prompt: GroupPrompt,
  choice: ApprovalChoice,
  client: GatewayClientLike = getGatewayClient(),
): Promise<void> {
  if (!prompt.hosted) throw new Error("That Hermes room approval is no longer pending.");
  if (choice !== "once" && choice !== "deny") {
    throw new Error("Hermes room approvals allow once or deny only.");
  }
  await request(client, "groups.approve", {
    room_id: roomId,
    member_id: prompt.hosted.memberId,
    task_id: prompt.hosted.taskId,
    execution_generation: prompt.hosted.executionGeneration,
    request_id: prompt.decision.requestId,
    choice,
  });
  await refreshHostedRoom(roomId, client);
}

export async function disbandHostedRoom(
  roomId: string,
  client: GatewayClientLike = getGatewayClient(),
): Promise<void> {
  await request(client, "groups.disband", {
    room_id: roomId,
    cancel_id: `iz-disband-${crypto.randomUUID()}`,
  });
}
