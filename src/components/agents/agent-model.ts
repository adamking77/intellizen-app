// The one agent shape the Agents page works with, and the pure rules over it.
// A Hermes profile and an ACP entry both become an `Agent`; the id says which
// door saves it (`hermes:<profile>` or `acp:<id>`).

import { defaultAcpLaunch, type AcpAgent, type AcpEngine } from "@/engine/acp-registry";

export type AgentEngine = "hermes" | AcpEngine;

export const ENGINES: { id: AgentEngine; label: string; acp: boolean }[] = [
  { id: "hermes", label: "Hermes", acp: false },
  { id: "claude-code", label: "Claude Code", acp: true },
  { id: "codex", label: "Codex", acp: true },
  { id: "gemini", label: "Gemini", acp: true },
  { id: "qwen", label: "Qwen", acp: true },
];

export type VoiceService = "minimax" | "elevenlabs" | "openai" | "macos-say";

export const VOICE_SERVICES: { id: VoiceService; label: string }[] = [
  { id: "minimax", label: "MiniMax" },
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "openai", label: "OpenAI" },
  { id: "macos-say", label: "macOS say" },
];

export function asVoiceService(v: unknown): VoiceService | undefined {
  return VOICE_SERVICES.some((s) => s.id === v) ? (v as VoiceService) : undefined;
}

export function engineLabel(engine: AgentEngine): string {
  return ENGINES.find((e) => e.id === engine)?.label ?? engine;
}

export interface Agent {
  id: string;
  /** Profile slug for Hermes; free text for ACP. */
  name: string;
  /** What to show; Hermes profiles may carry a display_name. */
  displayName: string;
  role: string;
  engine: AgentEngine;
  /** Hermes inference provider (deepseek, openai…). Empty for ACP. */
  provider: string;
  model: string;
  /** SOUL.md. Loaded on demand for Hermes profiles (`profiles.describe`). */
  identity: string;
  /** Folders this agent may read. Empty means it inherits the default. */
  context: string[];
  avatarColor?: string;
  /** A picture exists on the profile (`profiles.get_asset` fetches it). */
  hasAvatar: boolean;
  /** The voice it speaks in: `tts.provider` and `tts.<service>.voice_id` in
   *  a Hermes profile's config, `voice` on an ACP entry. */
  voiceId?: string;
  voiceService?: VoiceService;
  isDefault: boolean;
  description: string;
}

export function isHermes(agent: Pick<Agent, "engine">): boolean {
  return agent.engine === "hermes";
}

export function hermesAgentId(profile: string): string {
  return `hermes:${profile}`;
}

export function acpAgentId(id: string): string {
  return `acp:${id}`;
}

/** The profile name behind a `hermes:` id, or null. */
export function profileOf(agentId: string): string | null {
  return agentId.startsWith("hermes:") ? agentId.slice("hermes:".length) : null;
}

// ── Hermes ui_meta ──────────────────────────────────────────────────────
// What this app keeps on a profile that Hermes has no field for. Namespaced
// like Hermes Desktop's `hermes-bots` block, so the two never collide.

export const UI_META_KEY = "intellizen";

export interface AgentUiMeta {
  role?: string;
  avatar_color?: string;
  context?: string[];
}

export function toUiMeta(agent: Agent): AgentUiMeta {
  const meta: AgentUiMeta = {};
  if (agent.role.trim()) meta.role = agent.role.trim();
  if (agent.avatarColor) meta.avatar_color = agent.avatarColor;
  if (agent.context.length > 0) meta.context = agent.context;
  return meta;
}

interface ProfileRow {
  name?: unknown;
  is_default?: unknown;
  model?: unknown;
  provider?: unknown;
  description?: unknown;
  display_name?: unknown;
  has_avatar?: unknown;
  ui_meta?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** One `profiles.list` row as an Agent. Null when the row has no name. */
export function agentFromProfileRow(row: ProfileRow): Agent | null {
  const name = str(row.name);
  if (!name) return null;
  const ui = row.ui_meta && typeof row.ui_meta === "object" ? (row.ui_meta as Record<string, unknown>) : {};
  const mine = ui[UI_META_KEY] && typeof ui[UI_META_KEY] === "object" ? (ui[UI_META_KEY] as AgentUiMeta) : {};
  // Hermes Desktop's own roster colour, when this app has not pinned one.
  const bots = ui["hermes-bots"] && typeof ui["hermes-bots"] === "object" ? (ui["hermes-bots"] as { color?: unknown }) : {};
  const avatarColor = str(mine.avatar_color) || str(bots.color) || undefined;
  return {
    id: hermesAgentId(name),
    name,
    displayName: str(row.display_name) || name,
    role: str(mine.role) || str(row.description),
    engine: "hermes",
    provider: str(row.provider),
    model: str(row.model),
    identity: "",
    context: Array.isArray(mine.context) ? mine.context.filter((p): p is string => typeof p === "string") : [],
    avatarColor,
    hasAvatar: row.has_avatar === true,
    isDefault: row.is_default === true,
    description: str(row.description),
  };
}

export function agentFromAcp(entry: AcpAgent): Agent {
  return {
    id: acpAgentId(entry.id),
    name: entry.name,
    displayName: entry.name,
    role: entry.role ?? "",
    engine: entry.engine,
    provider: "",
    model: entry.model ?? "",
    identity: entry.identity ?? "",
    context: entry.context ?? [],
    avatarColor: entry.avatar || undefined,
    hasAvatar: false,
    voiceId: entry.voice?.voiceId || undefined,
    voiceService: asVoiceService(entry.voice?.service),
    isDefault: false,
    description: "",
  };
}

/** The ACP registry entry an Agent saves as. `previous` keeps the launch
 *  fields (command, args, cwd) this editor does not show. */
export function acpFromAgent(agent: Agent, previous?: AcpAgent): AcpAgent {
  if (agent.engine === "hermes") throw new Error("not an ACP agent");
  const id = (agent.id.startsWith("acp:") ? agent.id.slice(4) : agent.id) || `agent-${Date.now().toString(36)}`;
  const launch = previous ?? defaultAcpLaunch(agent.engine);
  return {
    id,
    name: agent.name.trim(),
    engine: agent.engine,
    command: launch.command,
    args: launch.args,
    cwd: previous?.cwd,
    model: agent.model.trim() || undefined,
    role: agent.role.trim() || undefined,
    avatar: agent.avatarColor,
    voice: agent.voiceId ? { service: agent.voiceService ?? "minimax", voiceId: agent.voiceId } : undefined,
    identity: agent.identity || undefined,
    context: agent.context.length ? agent.context : undefined,
  };
}

// ── Rules ───────────────────────────────────────────────────────────────

/** The default profile first, then everyone by name. */
export function sortAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });
}

/** What an agent answers to in a room: the name lowercased, spaces to dashes. */
export function handleOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Rows matching a query; picked rows always stay, so choosing one never
 *  makes it vanish under a filter. */
export function filterAgents(agents: Agent[], query: string, picked: string[] = []): Agent[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter(
    (a) =>
      picked.includes(a.id) ||
      a.displayName.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      handleOf(a.displayName).includes(q),
  );
}

/** A Hermes profile name: lowercase slug, the CLI's own rule. */
export function validProfileName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name);
}

/** Whether two agents differ, treating absent, empty and undefined alike. */
export function changed(one: Agent, two: Agent): boolean {
  const a = one as unknown as Record<string, unknown>;
  const b = two as unknown as Record<string, unknown>;
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k];
    const y = b[k];
    if (x === y) continue;
    if (blank(x) && blank(y)) continue;
    if (typeof x === "object" || typeof y === "object") {
      if (JSON.stringify(x) !== JSON.stringify(y)) return true;
      continue;
    }
    return true;
  }
  return false;
}

export function blankAgent(engine: AgentEngine = "hermes"): Agent {
  return {
    id: engine === "hermes" ? "" : acpAgentId(`agent-${Date.now().toString(36)}`),
    name: "",
    displayName: "",
    role: "",
    engine,
    provider: "",
    model: "",
    identity: "",
    context: [],
    hasAvatar: false,
    isDefault: false,
    description: "",
  };
}

// ── Teams ───────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  /** Agent ids, in the order they answer. */
  members: string[];
  /** Project ids this team is assigned to. */
  projects: string[];
}

/** Mirrors Hermes's `GROUP_CHAT_MAX_MEMBERS`. */
export const MAX_TEAM_MEMBERS = 6;
export const MIN_TEAM_MEMBERS = 2;
/** Rows before the team sheet shows a search field (Hermes's own threshold). */
export const TEAM_SEARCH_THRESHOLD = 8;

export function upsertTeam(teams: Team[], team: Team): Team[] {
  return teams.some((t) => t.id === team.id) ? teams.map((t) => (t.id === team.id ? team : t)) : [...teams, team];
}

export function removeTeam(teams: Team[], id: string): Team[] {
  return teams.filter((t) => t.id !== id);
}

/** Members that still exist, in team order. */
export function teamMembers(team: Team, agents: Agent[]): Agent[] {
  return team.members.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a);
}

export function parseTeamsFile(text: string): Team[] {
  const raw = JSON.parse(text) as { teams?: unknown };
  if (!Array.isArray(raw?.teams)) return [];
  return raw.teams
    .filter((t): t is Team => !!t && typeof t === "object" && typeof (t as Team).id === "string" && typeof (t as Team).name === "string")
    .map((t) => ({
      id: t.id,
      name: t.name,
      members: Array.isArray(t.members) ? t.members.filter((m): m is string => typeof m === "string") : [],
      projects: Array.isArray(t.projects) ? t.projects.filter((p): p is string => typeof p === "string") : [],
    }));
}

export function serializeTeams(teams: Team[]): string {
  return JSON.stringify({ version: 1, teams }, null, 2) + "\n";
}
