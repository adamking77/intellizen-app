// Rooms on disk: one `$APP_DATA/rooms/<roomId>.json` per room, through the
// fs plugin. Tests and the plain Vite server get an in-memory store.

import { isDesktopHost } from "@/engine/engine";

import { assignLegacyThreads } from "./group-chat";
import type { GroupChat } from "./types";

export interface RoomStorage {
  load(): Promise<GroupChat[]>;
  save(room: GroupChat): Promise<void>;
  remove(roomId: string): Promise<void>;
}

const ROOMS_DIR = "rooms";

/** `$APP_DATA/rooms/<id>.json` via `@tauri-apps/plugin-fs`. Needs the fs
 *  scope `$APPDATA/rooms/**` in `src-tauri/capabilities/default.json`. */
export function tauriRoomStorage(): RoomStorage {
  const fs = () => import("@tauri-apps/plugin-fs");
  const dir = async () => {
    const { BaseDirectory, exists, mkdir } = await fs();
    const opts = { baseDir: BaseDirectory.AppData };
    if (!(await exists(ROOMS_DIR, opts))) await mkdir(ROOMS_DIR, { ...opts, recursive: true });
    return opts;
  };
  return {
    async load() {
      const { readDir, readTextFile } = await fs();
      const opts = await dir();
      const entries = await readDir(ROOMS_DIR, opts);
      const rooms: GroupChat[] = [];
      for (const entry of entries) {
        if (!entry.isFile || !entry.name.endsWith(".json")) continue;
        try {
          const text = await readTextFile(`${ROOMS_DIR}/${entry.name}`, opts);
          const parsed = JSON.parse(text) as GroupChat;
          if (parsed && Array.isArray(parsed.log)) rooms.push(parsed);
        } catch {
          /* one unreadable room file must not hide the others */
        }
      }
      return rooms;
    },
    async save(room) {
      if (!room.roomId) return;
      const { writeTextFile } = await fs();
      const opts = await dir();
      await writeTextFile(`${ROOMS_DIR}/${room.roomId}.json`, JSON.stringify(room, null, 2), opts);
    },
    async remove(roomId) {
      const { exists, remove } = await fs();
      const opts = await dir();
      const path = `${ROOMS_DIR}/${roomId}.json`;
      if (await exists(path, opts)) await remove(path, opts);
    },
  };
}

export function memoryRoomStorage(seed: GroupChat[] = []): RoomStorage {
  const files = new Map<string, string>(seed.map((room) => [room.roomId || "", JSON.stringify(room)]));
  return {
    async load() {
      return [...files.values()].map((text) => JSON.parse(text) as GroupChat);
    },
    async save(room) {
      if (room.roomId) files.set(room.roomId, JSON.stringify(room));
    },
    async remove(roomId) {
      files.delete(roomId);
    },
  };
}

let storage: RoomStorage | null = null;

export function getRoomStorage(): RoomStorage {
  return (storage ??= isDesktopHost() ? tauriRoomStorage() : memoryRoomStorage());
}

/** Tests swap in a fake; pass null to reset. */
export function setRoomStorage(next: RoomStorage | null) {
  storage = next;
  pendingWrites.clear();
}

// A round writes the room several times per member turn; coalesce per room
// so the file is written once the burst settles.
const PERSIST_DEBOUNCE_MS = 150;
const pendingWrites = new Map<string, { timer: ReturnType<typeof setTimeout>; room: GroupChat }>();

export function persistRoom(roomId: string, room: GroupChat) {
  const pending = pendingWrites.get(roomId);
  if (pending) clearTimeout(pending.timer);
  const timer = setTimeout(() => {
    pendingWrites.delete(roomId);
    getRoomStorage()
      .save(room)
      .catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
  pendingWrites.set(roomId, { timer, room });
}

/** Write every coalesced room now (tests, app exit). */
export async function flushRoomWrites(): Promise<void> {
  const writes = [...pendingWrites.values()];
  for (const { timer } of writes) clearTimeout(timer);
  pendingWrites.clear();
  await Promise.all(writes.map(({ room }) => getRoomStorage().save(room).catch(() => undefined)));
}

/** Read every room file. Logs from before threading get synthetic thread
 *  ids so the delta machinery treats them like everything else. */
export async function loadRooms(): Promise<GroupChat[]> {
  const rooms = await getRoomStorage().load();
  return rooms
    .filter((room) => typeof room.roomId === "string" && room.roomId)
    .map((room) => ({
      ...room,
      log: assignLegacyThreads(room.log),
      watermarks: room.watermarks || {},
      holds: room.holds || {},
      members: Array.isArray(room.members) ? room.members : [],
      epoch: 0,
      running: false,
      sessions: {},
    }));
}
