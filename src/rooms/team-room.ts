import type { Team } from "@/components/agents/agent-model";
import type { HermesProfile } from "@/engine/profiles";

import { hasGroupChatNameBase, type GroupChatRoom } from "./group-chat";
import { groupMemberKey } from "./group-membership";
import { createRoom, ensureRoomsLoaded, listRooms } from "./rooms";
import type { GroupMember } from "./types";

export async function openTeamRoom(
  team: Team,
  directory: Record<string, HermesProfile>,
): Promise<string> {
  await ensureRoomsLoaded();
  const members = team.members
    .map((agentId): GroupMember | null => {
      const acp = agentId.startsWith("acp:");
      const name = acp ? agentId.slice(4) : agentId.replace(/^hermes:/, "");
      const profile = directory[acp ? agentId : name];
      if (!profile) return null;
      return {
        name,
        door: acp ? "acp" : "gateway",
        display_name: profile.displayName,
        title: profile.description,
        model: profile.model,
        provider: profile.provider,
        avatar_style: profile.avatarStyle,
        avatar_kind: profile.avatarKind,
        avatar_color: profile.avatarColor,
      };
    })
    .filter((member): member is GroupMember => member !== null);
  if (members.length !== team.members.length) {
    throw new Error("Some team members are unavailable.");
  }
  const keys = members.map(groupMemberKey).sort().join("|");
  const existing = listRooms().find(
    (room) =>
      hasGroupChatNameBase(room.name, team.name) &&
      (room.members || []).map(groupMemberKey).sort().join("|") === keys,
  );
  return existing?.roomId || createRoom(team.name, members);
}

/** Match the same roster/name contract used when reopening a team's room. */
export function teamForRoom(teams: Team[], room: GroupChatRoom | null | undefined): Team | undefined {
  if (!room) return undefined;
  const members = (room.members ?? []).map((member) => `${member.door === "acp" ? "acp" : "hermes"}:${member.name}`).sort().join("|");
  return teams.find((team) => hasGroupChatNameBase(room.name, team.name) && [...team.members].sort().join("|") === members);
}
