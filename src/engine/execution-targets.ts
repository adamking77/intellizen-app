import { listAcpAgents, type AcpAgent } from "./acp-registry";
import { getGatewayClient } from "./gateway";
import { listProfiles, type HermesProfile } from "./profiles";

export interface ExecutionTarget {
  ref: string;
  agentKey: string;
  kind: "hermes" | "acp";
  targetId: string;
  model: string | null;
  execution: "durable" | "ephemeral";
}

export function executionTargets(
  profiles: HermesProfile[],
  acpAgents: AcpAgent[],
): ExecutionTarget[] {
  return [
    ...profiles.map((profile) => ({
      ref: `hermes:${profile.name}`,
      agentKey: profile.name,
      kind: "hermes" as const,
      targetId: profile.name,
      model: profile.model,
      execution: "durable" as const,
    })),
    ...acpAgents.map((agent) => ({
      ref: `acp:${agent.id}`,
      agentKey: agent.id,
      kind: "acp" as const,
      targetId: agent.id,
      model: agent.model ?? null,
      execution: "ephemeral" as const,
    })),
  ];
}

/** Every executable agent exposed through the app's two structured doors. */
export async function listExecutionTargets(): Promise<ExecutionTarget[]> {
  const client = getGatewayClient();
  const [profiles, acpAgents] = await Promise.all([
    client.connectionState === "open" ? listProfiles(client).catch(() => []) : [],
    listAcpAgents().catch(() => []),
  ]);
  return executionTargets(profiles, acpAgents);
}
