/**
 * Room lifecycle: load what is on disk into the atom, make a room, rename it,
 * disband it. The coordination engine (`group-rounds.ts`) owns everything that
 * happens inside a room; this file owns the set of rooms.
 */

import {
  $groupChats,
  durableGroupChat,
  GROUP_CHAT_MAX_MEMBERS,
  GROUP_CHAT_MIN_MEMBERS,
  mintGroupRoomId,
  uniqueGroupChatName,
  updateGroupChat,
  type GroupChatRoom,
} from "./group-chat";
import { durableGroupChatMembers } from "./group-membership";
import { clearGroupClarify } from "./group-turns";
import { getRoomStorage, loadRooms } from "./persist";
import type { GroupChat, GroupMember } from "./types";

let loaded: Promise<void> | null = null;

/** Read every room file into the atom, once per app run. Safe to call from
 *  several components; they share the one promise. */
export function ensureRoomsLoaded(): Promise<void> {
  return (loaded ??= (async () => {
    const rooms = await loadRooms();
    const byId: Record<string, GroupChatRoom> = {};
    for (const room of rooms) {
      if (room.roomId) byId[room.roomId] = room as GroupChatRoom;
    }
    // Anything already in the atom (a room made before the load finished) wins.
    $groupChats.set({ ...byId, ...$groupChats.get() });
  })());
}

/** Tests: forget that rooms were loaded. */
export function resetRoomsForTests() {
  loaded = null;
  $groupChats.set({});
}

/** Every live room, newest activity first. Disband tombstones excluded. */
export function listRooms(): GroupChatRoom[] {
  return Object.values($groupChats.get())
    .filter((room) => !room.tombstone)
    .sort((a, b) => {
      const at = (r: GroupChat) => (r.log.length ? r.log[r.log.length - 1].at || 0 : r.createdAt || 0);
      return at(b) - at(a);
    });
}

export class RoomMemberCountError extends Error {}

/** Make a room. Returns its roomId — the route parameter and the file name.
 *  The display name is deduplicated; the id never is, so a disbanded and
 *  recreated room never resumes the old one's member sessions. */
export function createRoom(name: string, members: GroupMember[]): string {
  const seated = members.filter((m) => m?.name);
  if (seated.length < GROUP_CHAT_MIN_MEMBERS) {
    throw new RoomMemberCountError(`A room needs at least ${GROUP_CHAT_MIN_MEMBERS} members.`);
  }
  if (seated.length > GROUP_CHAT_MAX_MEMBERS) {
    throw new RoomMemberCountError(`A room holds at most ${GROUP_CHAT_MAX_MEMBERS} members.`);
  }

  const taken = new Set(listRooms().map((room) => room.name || ""));
  const display = uniqueGroupChatName(String(name || "").trim().slice(0, 64) || "Room", taken);
  const roomId = mintGroupRoomId();

  updateGroupChat(roomId, (room) => {
    room.roomId = roomId;
    room.name = display;
    room.createdAt = Date.now();
    room.members = durableGroupChatMembers(seated);
    return room;
  });

  return roomId;
}

/** Rename a room. Its roomId, sessions and log are untouched. */
export function renameRoom(roomId: string, name: string): void {
  const trimmed = String(name || "").trim().slice(0, 64);
  if (!trimmed) return;
  const taken = new Set(listRooms().filter((r) => r.roomId !== roomId).map((r) => r.name || ""));
  updateGroupChat(roomId, (room) => {
    room.name = uniqueGroupChatName(trimmed, taken);
    return room;
  });
}

/** Change who is in a room. The log and every watermark survive: a member that
 *  leaves and returns picks up from where it stopped reading. */
export function setRoomMembers(roomId: string, members: GroupMember[]): void {
  const seated = members.filter((m) => m?.name);
  if (seated.length < GROUP_CHAT_MIN_MEMBERS || seated.length > GROUP_CHAT_MAX_MEMBERS) {
    throw new RoomMemberCountError(
      `A room holds ${GROUP_CHAT_MIN_MEMBERS}–${GROUP_CHAT_MAX_MEMBERS} members.`,
    );
  }
  updateGroupChat(roomId, (room) => {
    room.members = durableGroupChatMembers(seated);
    return room;
  });
}

/** Disband a room: it leaves the list, its file is deleted, and a tombstone
 *  holds the epoch bump so a drive still in flight bails at its next member
 *  boundary instead of writing into a room that no longer exists. */
export async function disbandRoom(roomId: string): Promise<void> {
  updateGroupChat(roomId, (room) => {
    room.epoch = (room.epoch || 0) + 1;
    room.running = false;
    room.turn = null;
    room.tombstone = true;
    return room;
  });
  clearGroupClarify(roomId);
  await getRoomStorage().remove(roomId);

  // The in-flight drive checks the epoch at its next boundary; drop the
  // tombstone after that has had a chance to happen.
  setTimeout(() => {
    const all = { ...$groupChats.get() };
    if (all[roomId]?.tombstone) {
      delete all[roomId];
      $groupChats.set(all);
    }
  }, 1000);
}

/** One room by id, or null. */
export function getRoom(roomId: string): GroupChatRoom | null {
  const room = $groupChats.get()[roomId];
  return room && !room.tombstone ? room : null;
}

/** The durable shape, for a test or an export. */
export function roomSnapshot(roomId: string): GroupChat | null {
  const room = getRoom(roomId);
  return room ? durableGroupChat(room) : null;
}
