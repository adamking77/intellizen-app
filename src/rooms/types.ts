// Room domain model. The shapes are Hermes Desktop's `hermes-bots/types.ts`
// (MIT) cut to what one machine with two doors needs: a member is a Hermes
// profile or an ACP agent, named once, and rooms are keyed by their roomId.

import type { Decision } from "@/engine/transcript";

/** Which door a member is reached through. */
export type DoorKind = "gateway" | "acp";
export type RoomOwner = "hermes" | "local";

/** A room member: a Hermes profile (`gateway`) or an ACP agent (`acp`). The
 *  name is the profile name or agent id and is the member's key in a room, so
 *  names are unique across doors. */
export interface GroupMember {
  name: string;
  door: DoorKind;
  /** What to type to address it: `@handle`. Defaults to the slugged name. */
  handle?: string;
  /** Role or friendly title; mentions resolve against it too. */
  title?: null | string;
  display_name?: string;
  model?: null | string;
  provider?: null | string;
  avatar_style?: "sphere" | "blob";
  avatar_kind?: string;
  avatar_color?: string;
}

export interface GroupMessageAuthor {
  kind: "member" | "user";
  name: string;
  /** Where the speaker lives when not on this machine's engine. */
  source?: string;
}

export interface GroupMessage {
  /** Milliseconds. */
  at: number;
  from: GroupMessageAuthor;
  id?: string;
  text: string;
  /** Messages predating threading carry the sentinel thread `'legacy'`. */
  thread?: string;
}

export interface GroupHold {
  at?: number;
  noted?: boolean;
}

export interface GroupChat {
  /** Immutable identity: the file name under `$APP_DATA/rooms/` and the
   *  member-session title. */
  roomId?: null | string;
  /** Editable display name. */
  name?: string;
  createdAt?: number;
  /** Hermes owns durable gateway-only rooms; the local engine owns rooms
   *  that need ACP. Records from before this field are local rooms. */
  owner?: RoomOwner;
  /** Last Hermes log sequence copied into this readable local cache. */
  remoteCursor?: number;
  /** Runtime-only: this cached Hermes room has rehydrated this app run. */
  synced?: boolean;
  /** Runtime-only reason a Hermes room could not rehydrate. */
  syncError?: string | null;
  /** Bumped to abandon in-flight member turns from a previous round. */
  epoch?: number;
  holds?: Record<string, GroupHold>;
  log: GroupMessage[];
  /** Durable Hermes status receipts projected from its typed room events. */
  activity?: GroupActivityEvent[];
  members?: GroupMember[];
  running?: boolean;
  /** Live gateway session per member key. Runtime-only: a fresh app run
   *  opens fresh sessions and re-feeds the recent log. */
  sessions?: Record<string, string>;
  stranded?: Record<string, number | { before: number; thread?: string }>;
  /** Left behind briefly when a room is disbanded mid-drive. */
  tombstone?: boolean;
  /** How far each `<thread>::<member>` has read into `log`. */
  watermarks: Record<string, number>;
}

/** A member's blocking approval or clarify question, mirrored into the room
 *  so the room can render and answer it in context. */
export interface GroupPrompt {
  at: number;
  group: string;
  member: string;
  memberKey: string;
  sessionId: string;
  thread: null | string;
  decision: Decision;
  hosted?: {
    memberId: string;
    taskId: string;
    executionGeneration: number;
  };
}

export type GroupActivityKind =
  | "cancelled"
  | "capped"
  | "delivered"
  | "failed"
  | "held"
  | "passed"
  | "queued"
  | "replied"
  | "settled"
  | "stopped"
  | "timed-out"
  | "working";

export interface GroupActivityEvent {
  at: number;
  group: string;
  kind: GroupActivityKind;
  member?: string;
  preview?: string;
  reason?: string;
}
