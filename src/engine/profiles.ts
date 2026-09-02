// Hermes profiles, from `profiles.list` over the gateway.

import { request, type GatewayClientLike } from "./contract";

export interface HermesProfile {
  name: string;
  isDefault: boolean;
  model: string | null;
  provider: string | null;
  /** Reachable through the engine this app is connected to. `profiles.list`
   *  answers only while the gateway is open, and every profile it lists is
   *  served by that gateway, so this is true for each row it returns. */
  gatewayRunning: boolean;
  description: string;
  displayName: string;
}

interface ProfileRow {
  name?: unknown;
  is_default?: unknown;
  model?: unknown;
  provider?: unknown;
  description?: unknown;
  display_name?: unknown;
}

export async function listProfiles(client: GatewayClientLike): Promise<HermesProfile[]> {
  const result = await request<{ profiles?: ProfileRow[] }>(client, "profiles.list", {
    include_sessions: false,
  });
  const rows = Array.isArray(result?.profiles) ? result.profiles : [];
  return rows
    .filter((row): row is ProfileRow & { name: string } => typeof row.name === "string" && row.name.length > 0)
    .map((row) => ({
      name: row.name,
      isDefault: row.is_default === true,
      model: typeof row.model === "string" && row.model ? row.model : null,
      provider: typeof row.provider === "string" && row.provider ? row.provider : null,
      gatewayRunning: true,
      description: typeof row.description === "string" ? row.description : "",
      displayName: typeof row.display_name === "string" ? row.display_name : "",
    }));
}

/** The profile a fresh panel starts on: the one Hermes marks default. */
export function defaultProfile(profiles: HermesProfile[]): HermesProfile | null {
  return profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
}
