import { afterEach, describe, expect, it } from "vitest";

import { $groupChats } from "./group-chat";
import { parseGroupChatMentions, resolveGroupResponders } from "./group-rounds";
import { flushRoomWrites, memoryRoomStorage, setRoomStorage } from "./persist";
import { createRoom, disbandRoom, ensureRoomsLoaded, getRoom, resetRoomsForTests } from "./rooms";
import type { GroupMember } from "./types";

const members: GroupMember[] = [
  { name: "fiona", door: "gateway", display_name: "Fiona" },
  { name: "cc", door: "acp", display_name: "Claude Code" },
];

afterEach(() => {
  resetRoomsForTests();
  setRoomStorage(null);
});

describe("rooms", () => {
  it("creates, routes mentions, persists and disbands a mixed room", async () => {
    const storage = memoryRoomStorage();
    setRoomStorage(storage);
    const id = createRoom("Build room", members);
    expect(getRoom(id)?.members).toMatchObject(members);
    expect(parseGroupChatMentions("@cc take this", members).mentioned).toEqual(new Set(["cc"]));
    expect(resolveGroupResponders([{ at: 1, from: { kind: "user", name: "You" }, text: "@cc take this" }], members)).toEqual([members[1]]);

    await flushRoomWrites();
    resetRoomsForTests();
    await ensureRoomsLoaded();
    expect($groupChats.get()[id]?.name).toBe("Build room");

    await disbandRoom(id);
    expect(getRoom(id)).toBeNull();
  });
});
