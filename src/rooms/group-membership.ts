/**
 * Who is in a room: member identity, the handles and friendly names a
 * mention resolves against, and the descriptor derivation the room engine
 * and the room UI both read. The pure parts of Hermes Desktop's
 * `group-membership.ts` and `data.ts` (MIT), without bot meta.
 */

import type { HermesProfile } from "@/engine/profiles";

import { $groupChats } from "./group-chat";
import type { GroupChat, GroupMember } from "./types";

/** Stable per-member identity inside a group room: the profile name or ACP
 *  agent id. Names are unique across doors, so the bare name is the key. */
export function groupMemberKey(member: GroupMember): string {
  return member?.name;
}

/** `@name` form of a name: lowercase, spaces as dashes. The untitled primary
 *  profile is literally named "default" and answers to @hermes. */
export function botHandle(name: string, member?: Pick<GroupMember, "handle"> | null): string {
  const explicit = String(member?.handle || "").trim();
  if (explicit) return explicit;
  const trimmed = String(name || "").trim();
  if (trimmed.toLowerCase() === "default") return "hermes";
  return trimmed.toLowerCase().replace(/\s+/g, "-");
}

/** The friendly names a renamed member also answers to. */
export function botFriendlyNames(member: GroupMember): string[] {
  return [member.title, member.display_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

/** Mention forms of one friendly name: lowercased, slugged, and collapsed. */
export function mentionNameForms(friendly: string): string[] {
  const lower = String(friendly || "").trim().toLowerCase();
  if (!lower) return [];
  return [lower, lower.replace(/\s+/g, "-"), lower.replace(/[\s_-]+/g, "")];
}

/** What a member is called on screen: title, then display name, then the
 *  profile name — with the untitled "default" shown as Hermes. */
export function displayName(member: Pick<GroupMember, "name" | "title" | "display_name">): string {
  const title = String(member.title || "").trim();
  if (title) return title;
  const renamed = String(member.display_name || "").trim();
  if (renamed) return renamed;
  return member.name.toLowerCase() === "default" ? "Hermes" : member.name;
}

/** A Hermes profile as a room member. */
export function memberFromProfile(profile: HermesProfile): GroupMember {
  return {
    name: profile.name,
    door: "gateway",
    ...(profile.displayName ? { display_name: profile.displayName } : {}),
    model: profile.model,
    provider: profile.provider,
  };
}

/** Persist only what a member needs to be seated and addressed again. */
export function durableGroupChatMembers(members: GroupMember[]): GroupMember[] {
  return (members || []).map((member) => ({
    name: member.name,
    door: member.door,
    handle: member.handle || botHandle(member.name),
    ...(member.title ? { title: member.title } : {}),
    ...(member.display_name ? { display_name: member.display_name } : {}),
    ...(member.model ? { model: member.model } : {}),
    ...(member.provider ? { provider: member.provider } : {}),
  }));
}

/** Display names of REAL rooms in the atom — disband tombstones excluded. */
export function liveGroupChatNames(): string[] {
  return Object.values($groupChats.get())
    .filter((room) => !room?.tombstone)
    .map((room) => room.name || "")
    .filter(Boolean);
}

/** Millisecond timestamp of a room's newest log entry (0 for a silent room). */
export function groupLastActivity(room?: GroupChat | null): number {
  const log = Array.isArray(room?.log) ? room.log : [];
  return log.length ? log[log.length - 1].at || 0 : 0;
}
