import { hermesRest } from "@/engine/rest";

export type HermesCapabilityKind = "skill" | "tool" | "connection";

export interface HermesCapability {
  id: string;
  kind: HermesCapabilityKind;
  name: string;
  description: string;
  detail: string;
  enabled: boolean;
  available: boolean;
}

type SkillRow = {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  provenance?: unknown;
  enabled?: unknown;
};

type ToolsetRow = {
  name?: unknown;
  label?: unknown;
  description?: unknown;
  platform_label?: unknown;
  enabled?: unknown;
  available?: unknown;
  configured?: unknown;
};

type McpRow = {
  name?: unknown;
  transport?: unknown;
  enabled?: unknown;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function normalizeHermesCapabilities(
  skills: SkillRow[],
  toolsets: ToolsetRow[],
  servers: McpRow[],
): HermesCapability[] {
  return [
    ...skills.map((row) => ({
      id: text(row.name),
      kind: "skill" as const,
      name: text(row.name),
      description: text(row.description),
      detail: text(row.category) || text(row.provenance) || "skill",
      enabled: row.enabled !== false,
      available: true,
    })),
    ...toolsets.map((row) => ({
      id: text(row.name),
      kind: "tool" as const,
      name: text(row.label) || text(row.name),
      description: text(row.description),
      detail: text(row.platform_label) || (row.configured === false ? "setup required" : "toolset"),
      enabled: row.enabled === true,
      available: row.available !== false,
    })),
    ...servers.map((row) => ({
      id: text(row.name),
      kind: "connection" as const,
      name: text(row.name),
      description: text(row.transport) ? `${text(row.transport)} MCP server` : "MCP server",
      detail: text(row.transport) || "connection",
      enabled: row.enabled !== false,
      available: true,
    })),
  ].filter((row) => row.id);
}

function profileQuery(profile: string) {
  return profile ? `?profile=${encodeURIComponent(profile)}` : "";
}

export async function listHermesCapabilities(profile: string): Promise<HermesCapability[]> {
  const query = profileQuery(profile);
  const [skills, toolsets, mcp] = await Promise.all([
    hermesRest<SkillRow[]>(`/api/skills${query}`),
    hermesRest<ToolsetRow[]>(`/api/tools/toolsets${query}`),
    hermesRest<{ servers?: McpRow[] }>(`/api/mcp/servers${query}`),
  ]);
  return normalizeHermesCapabilities(skills, toolsets, mcp.servers ?? []);
}

export async function setHermesCapability(
  profile: string,
  capability: Pick<HermesCapability, "id" | "kind">,
  enabled: boolean,
): Promise<void> {
  const body = JSON.stringify({ enabled, profile: profile || undefined });
  if (capability.kind === "skill") {
    await hermesRest("/api/skills/toggle", {
      method: "PUT",
      body: JSON.stringify({ name: capability.id, enabled, profile: profile || undefined }),
    });
    return;
  }
  const id = encodeURIComponent(capability.id);
  const path = capability.kind === "tool"
    ? `/api/tools/toolsets/${id}`
    : `/api/mcp/servers/${id}/enabled`;
  await hermesRest(path, { method: "PUT", body });
}
