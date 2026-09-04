// The two-function adapter under the vendored room engine (ROADMAP "What we
// borrow"): `request` talks to this app's gateway, `requestProfile` talks to
// one member through its door. A door hands back a `GatewayClientLike` for a
// member, so `src/engine/session.ts` and `src/engine/decisions.ts` drive a
// Hermes profile and an ACP agent the same way: `session.create`,
// `prompt.submit`, `session.interrupt`, `approval.respond`,
// `clarify.respond`, and the events those raise.

import { request as gatewayRequest, type GatewayClientLike, type GatewayMethod } from "@/engine/contract";
import { acpEngineLabel, listAcpAgents } from "@/engine/acp-registry";
import { acpGatewayClient } from "@/engine/acp-session";
import { getGatewayClient } from "@/engine/gateway";

import type { DoorKind, GroupMember } from "./types";

export interface AgentDoor {
  readonly kind: DoorKind;
  /** The client a member's turns go through. For the gateway door this is
   *  the app's one gateway client; an ACP door answers the same five methods
   *  and emits the same events over stdio, isolated by room caller. */
  client(member: GroupMember, caller?: string): GatewayClientLike;
  /** Whether a turn could start right now. */
  ready(): boolean;
}

export const gatewayDoor: AgentDoor = {
  kind: "gateway",
  client: () => getGatewayClient(),
  ready: () => getGatewayClient().connectionState === "open",
};

const acpDoor: AgentDoor = {
  kind: "acp",
  client: (member, caller = "room") => acpGatewayClient(member.name, caller),
  ready: () => true,
};

/** ACP agents the room sheet may seat; empty until the ACP door is wired. */
export async function listAcpMembers(): Promise<GroupMember[]> {
  try {
    return (await listAcpAgents()).map((agent) => ({
      name: agent.id,
      door: "acp",
      display_name: agent.name,
      title: agent.role,
      model: agent.model,
      provider: acpEngineLabel(agent.engine),
      avatar_style: agent.avatarStyle,
      avatar_kind: agent.avatarKind,
      avatar_color: agent.avatarColor || agent.avatar,
    }));
  } catch {
    return [];
  }
}

const doors: Record<DoorKind, AgentDoor> = {
  gateway: gatewayDoor,
  acp: acpDoor,
};

export function doorFor(member: GroupMember): AgentDoor {
  return doors[member.door];
}

/** Whether a member could take a turn: its door is wired and ready. */
export function memberReady(member: GroupMember): boolean {
  try {
    return doorFor(member).ready();
  } catch {
    return false;
  }
}

/** The client a member's turn goes through. */
export function clientFor(member: GroupMember, caller?: string): GatewayClientLike {
  return doorFor(member).client(member, caller);
}

/** Call this app's gateway. */
export function request<T = unknown>(method: GatewayMethod, params: Record<string, unknown> = {}): Promise<T> {
  return gatewayRequest<T>(getGatewayClient(), method, params);
}

/** Call one member through its door. */
export function requestProfile<T = unknown>(
  member: GroupMember,
  method: GatewayMethod,
  params: Record<string, unknown> = {},
): Promise<T> {
  return gatewayRequest<T>(clientFor(member), method, params);
}
