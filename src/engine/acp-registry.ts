import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readTextFile, writeFile } from "@tauri-apps/plugin-fs";

export type AcpEngine = "claude-code" | "codex" | "gemini" | "qwen";

export const ACP_ENGINES: readonly AcpEngine[] = ["claude-code", "codex", "gemini", "qwen"];

export const ACP_ENGINE_LABEL: Record<AcpEngine, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  qwen: "Qwen",
};

export interface AcpVoice {
  service: string;
  voiceId: string;
}

export interface AcpAgent {
  id: string;
  name: string;
  engine: AcpEngine;
  command: string;
  args: string[];
  cwd?: string;
  model?: string;
  role?: string;
  avatar?: string;
  avatarStyle?: "sphere" | "blob";
  avatarKind?: string;
  avatarColor?: string;
  voice?: AcpVoice;
  identity?: string;
  context?: string[];
}

export interface AcpCommandProbe {
  command: string;
  available: boolean;
  path: string | null;
}

const FILE = "acp-agents.json";
const DIR = { baseDir: BaseDirectory.AppData };

const ACP_LAUNCH: Record<AcpEngine, Pick<AcpAgent, "command" | "args">> = {
  "claude-code": { command: "claude-agent-acp", args: [] },
  codex: { command: "codex-acp", args: [] },
  gemini: { command: "gemini", args: ["--experimental-acp"] },
  qwen: { command: "qwen", args: ["--acp"] },
};

export function defaultAcpLaunch(engine: AcpEngine): Pick<AcpAgent, "command" | "args"> {
  return ACP_LAUNCH[engine];
}

function isEngine(value: unknown): value is AcpEngine {
  return typeof value === "string" && (ACP_ENGINES as readonly string[]).includes(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length ? strings : undefined;
}

function voice(value: unknown): AcpVoice | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const service = optionalString(row.service);
  const voiceId = optionalString(row.voiceId ?? row.voice_id);
  return service && voiceId ? { service, voiceId } : undefined;
}

export function normalizeAcpAgent(value: unknown): AcpAgent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = optionalString(row.id);
  const command = optionalString(row.command);
  if (!id || !command || !isEngine(row.engine)) return null;

  const avatarStyle = row.avatarStyle === "blob" || row.avatar_style === "blob" ? "blob" : undefined;
  const avatarKind = optionalString(row.avatarKind ?? row.avatar_kind);
  const avatarColor = optionalString(row.avatarColor ?? row.avatar_color);
  const cwd = optionalString(row.cwd);
  const model = optionalString(row.model);
  const role = optionalString(row.role);
  const avatar = optionalString(row.avatar);
  const normalizedVoice = voice(row.voice);
  const identity = optionalString(row.identity);
  const context = stringList(row.context);

  return {
    id,
    name: optionalString(row.name) ?? ACP_ENGINE_LABEL[row.engine],
    engine: row.engine,
    command,
    args: Array.isArray(row.args) ? row.args.filter((item): item is string => typeof item === "string") : [],
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
    ...(role ? { role } : {}),
    ...(avatar ? { avatar } : {}),
    ...(avatarStyle ? { avatarStyle } : {}),
    ...(avatarKind ? { avatarKind } : {}),
    ...(avatarColor ? { avatarColor } : {}),
    ...(normalizedVoice ? { voice: normalizedVoice } : {}),
    ...(identity ? { identity } : {}),
    ...(context ? { context } : {}),
  };
}

export function normalizeAcpRegistry(value: unknown): AcpAgent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const agents: AcpAgent[] = [];
  for (const row of value) {
    const agent = normalizeAcpAgent(row);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    agents.push(agent);
  }
  return agents;
}

async function readRegistry(): Promise<AcpAgent[]> {
  if (!(await exists(FILE, DIR))) return [];
  try {
    return normalizeAcpRegistry(JSON.parse(await readTextFile(FILE, DIR)));
  } catch (error) {
    throw new Error(`The ACP registry is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeRegistry(agents: AcpAgent[]): Promise<AcpAgent[]> {
  if (!(await exists("", DIR))) await mkdir("", { ...DIR, recursive: true });
  await writeFile(FILE, new TextEncoder().encode(JSON.stringify(agents, null, 2)), DIR);
  return agents;
}

export function listAcpAgents(): Promise<AcpAgent[]> {
  return readRegistry();
}

export function probeAcpCommands(commands: string[]): Promise<AcpCommandProbe[]> {
  return invoke("acp_probe", { commands: [...new Set(commands)] });
}

export async function saveAcpAgent(agent: AcpAgent): Promise<AcpAgent> {
  const clean = normalizeAcpAgent(agent);
  if (!clean) throw new Error("An ACP agent needs an id, an engine and a command.");
  const agents = await readRegistry();
  const index = agents.findIndex((candidate) => candidate.id === clean.id);
  if (index === -1) agents.push(clean);
  else agents[index] = clean;
  await writeRegistry(agents);
  return clean;
}

export async function deleteAcpAgent(id: string): Promise<AcpAgent[]> {
  const agents = (await readRegistry()).filter((agent) => agent.id !== id);
  return writeRegistry(agents);
}
