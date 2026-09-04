import { afterEach, describe, expect, it } from "vitest";

import type { GatewayClientLike } from "@/engine/contract";

import { $groupChats, $groupClarify } from "./group-chat";
import {
  approveHostedRoom,
  createHostedRoom,
  refreshHostedRoom,
  roomOwnerFor,
} from "./hermes-hosted";
import { flushRoomWrites, memoryRoomStorage, setRoomStorage } from "./persist";
import { resetRoomsForTests } from "./rooms";
import type { GroupMember } from "./types";

const members: GroupMember[] = [
  { name: "fable", door: "gateway", display_name: "Fable" },
  { name: "keel", door: "gateway", display_name: "Keel" },
];

class FakeGateway implements GatewayClientLike {
  readonly connectionState = "open" as const;
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  constructor(private readonly replies: Record<string, unknown | unknown[]>) {}
  async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ method, params });
    const reply = this.replies[method];
    return (Array.isArray(reply) ? reply.shift() : reply) as T;
  }
  onAny() {
    return () => undefined;
  }
  onState() {
    return () => undefined;
  }
}

const room = {
  room_id: "r1",
  name: "Review",
  created_at: 10,
  latest_seq: 3,
  members: members.map((member) => ({
    member_id: member.name,
    profile: member.name,
    handle: member.name,
    display_name: member.display_name,
    target: { kind: "local", profile: member.name },
  })),
};

function gateway(overrides: Record<string, unknown | unknown[]> = {}) {
  return new FakeGateway({
    "groups.capabilities": { driver: true, methods: [
      "groups.list", "groups.create", "groups.state", "groups.send",
      "groups.log", "groups.disband", "groups.stop", "groups.approve",
    ] },
    "groups.create": { room },
    "groups.state": { room, driver_status: { working: false, pending_actions: [] } },
    "groups.log": {
      events: [
        { seq: 1, event_id: "create", kind: "room.created", created_at: 10, payload: {} },
        { seq: 2, event_id: "u1", kind: "message.user", created_at: 11, payload: { text: "Review this", thread_id: "t1" } },
        { seq: 3, event_id: "m1", kind: "message.member", created_at: 12, payload: { member_id: "fable", text: "Looks good", thread_id: "t1" } },
      ],
      cursor: 3,
      latest_seq: 3,
      has_more: false,
    },
    "groups.approve": { approved: true },
    ...overrides,
  });
}

afterEach(async () => {
  await flushRoomWrites();
  resetRoomsForTests();
  $groupClarify.set({});
  setRoomStorage(null);
});

describe("Hermes hosted rooms", () => {
  it("uses Hermes only when every member is a gateway profile", () => {
    expect(roomOwnerFor(members)).toBe("hermes");
    expect(roomOwnerFor([...members, { name: "claude", door: "acp" }])).toBe("local");
  });

  it("creates one hosted room and projects its durable log into the existing store", async () => {
    setRoomStorage(memoryRoomStorage());
    const client = gateway();
    await createHostedRoom("r1", "Review", members, client);

    expect(client.calls.find((call) => call.method === "groups.create")?.params).toMatchObject({
      room_id: "r1",
      name: "Review",
      members: [
        { member_id: "fable", profile: "fable", target: { kind: "local", profile: "fable" } },
        { member_id: "keel", profile: "keel", target: { kind: "local", profile: "keel" } },
      ],
    });
    expect($groupChats.get().r1).toMatchObject({
      owner: "hermes",
      synced: true,
      remoteCursor: 3,
      log: [
        { id: "u1", from: { kind: "user" }, text: "Review this" },
        { id: "m1", from: { kind: "member", name: "fable" }, text: "Looks good" },
      ],
    });
  });

  it("replays from sequence zero after a relaunch instead of trusting the cache", async () => {
    setRoomStorage(memoryRoomStorage());
    $groupChats.set({
      r1: {
        roomId: "r1",
        name: "Review",
        owner: "hermes",
        synced: false,
        remoteCursor: 2,
        log: [{ id: "stale", at: 1, from: { kind: "user", name: "You" }, text: "stale" }],
        watermarks: {},
      },
    });
    const client = gateway();
    await refreshHostedRoom("r1", client);
    expect(client.calls.find((call) => call.method === "groups.log")?.params.since_seq).toBe(0);
    expect($groupChats.get().r1.log.map((entry) => entry.id)).toEqual(["u1", "m1"]);
  });

  it("mirrors and resolves the exact hosted approval", async () => {
    setRoomStorage(memoryRoomStorage());
    const client = gateway({
      "groups.state": [
        {
          room,
          driver_status: {
            working: false,
            pending_actions: [{
              kind: "approval",
              member_id: "keel",
              task_id: "task-1",
              execution_generation: 2,
              request_id: "approve-1",
              approval: { command: "git commit" },
            }],
          },
        },
        { room, driver_status: { working: false, pending_actions: [] } },
      ],
      "groups.log": [
        { events: [], cursor: 3, latest_seq: 3, has_more: false },
        { events: [], cursor: 3, latest_seq: 3, has_more: false },
      ],
    });
    await refreshHostedRoom("r1", client);
    const prompt = Object.values($groupClarify.get())[0];
    await approveHostedRoom("r1", prompt, "once", client);
    expect(client.calls.find((call) => call.method === "groups.approve")?.params).toEqual({
      room_id: "r1",
      member_id: "keel",
      task_id: "task-1",
      execution_generation: 2,
      request_id: "approve-1",
      choice: "once",
    });
    expect(Object.values($groupClarify.get())).toHaveLength(0);
  });
});
