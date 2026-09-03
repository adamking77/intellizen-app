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
  /** First folder is the session cwd; absent means the Settings default. */
  context?: string[];
  avatarStyle?: "sphere" | "blob";
  avatarKind?: string;
  avatarColor?: string;
  hasAvatar?: boolean;
  avatarImage?: string | null;
}

interface ProfileRow {
  name?: unknown;
  is_default?: unknown;
  model?: unknown;
  provider?: unknown;
  description?: unknown;
  display_name?: unknown;
  ui_meta?: unknown;
  has_avatar?: unknown;
}

export async function listProfiles(client: GatewayClientLike): Promise<HermesProfile[]> {
  const result = await request<{ profiles?: ProfileRow[] }>(client, "profiles.list", {
    include_sessions: false,
  });
  const rows = Array.isArray(result?.profiles) ? result.profiles : [];
  return rows
    .filter((row): row is ProfileRow & { name: string } => typeof row.name === "string" && row.name.length > 0)
    .map((row) => {
      const ui = row.ui_meta && typeof row.ui_meta === "object" ? row.ui_meta as Record<string, unknown> : {};
      const mine = ui.intellizen && typeof ui.intellizen === "object"
        ? ui.intellizen as { context?: unknown; avatar_style?: unknown; avatar_kind?: unknown; avatar_color?: unknown }
        : {};
      const bots = ui["hermes-bots"] && typeof ui["hermes-bots"] === "object"
        ? ui["hermes-bots"] as { color?: unknown }
        : {};
      const context = Array.isArray(mine.context)
        ? mine.context.filter((path): path is string => typeof path === "string")
        : [];
      const avatarStyle = mine.avatar_style === "blob" ? "blob" : undefined;
      const avatarKind = typeof mine.avatar_kind === "string" && mine.avatar_kind ? mine.avatar_kind : undefined;
      const avatarColor =
        typeof mine.avatar_color === "string" && mine.avatar_color
          ? mine.avatar_color
          : typeof bots.color === "string" && bots.color
            ? bots.color
            : undefined;
      return {
        name: row.name,
        isDefault: row.is_default === true,
        model: typeof row.model === "string" && row.model ? row.model : null,
        provider: typeof row.provider === "string" && row.provider ? row.provider : null,
        gatewayRunning: true,
        description: typeof row.description === "string" ? row.description : "",
        displayName: typeof row.display_name === "string" ? row.display_name : "",
        ...(avatarStyle ? { avatarStyle } : {}),
        ...(avatarKind ? { avatarKind } : {}),
        ...(avatarColor ? { avatarColor } : {}),
        ...(row.has_avatar === true ? { hasAvatar: true } : {}),
        ...(context.length ? { context } : {}),
      };
    });
}

export async function loadProfileAvatar(
  client: GatewayClientLike,
  profile: Pick<HermesProfile, "name" | "hasAvatar">,
): Promise<string | null> {
  if (!profile.hasAvatar) return null;
  const result = await request<{ found?: boolean; data?: string }>(client, "profiles.get_asset", {
    name: profile.name,
    asset: "avatar",
  });
  return result?.found && typeof result.data === "string" ? result.data : null;
}

/** The profile a fresh panel starts on: the one Hermes marks default. */
export function defaultProfile(profiles: HermesProfile[]): HermesProfile | null {
  return profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
}
