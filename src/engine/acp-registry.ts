import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readTextFile, writeFile } from "@tauri-apps/plugin-fs";

/** Registry ids are intentionally open-ended. The official ACP registry, not
 *  this bundle, decides which agent families can appear. */
export type AcpEngine = string;

const COMPATIBILITY_ENGINES = ["claude-code", "codex", "gemini", "qwen"] as const;

export const ACP_ENGINE_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  qwen: "Qwen",
};

export function acpEngineLabel(engine: AcpEngine): string {
  const known = ACP_ENGINE_LABEL[engine];
  if (known) return known;
  return engine
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

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

export interface AcpProviderDiscovery {
  engine: AcpEngine;
  label: string;
  icon?: string;
  command: string;
  args: string[];
  configured: number;
  agentIds: string[];
  launchAgentId?: string;
  available: boolean;
  adapterAvailable: boolean;
  cliAvailable: boolean;
  bridgeOnDemand: boolean;
  path: string;
  source: string;
}

interface NativeAcpProvider {
  id: string;
  name: string;
  icon?: string;
  command: string;
  args: string[];
  path: string;
  source: string;
}

export interface AcpProviderStatus {
  agentId: string;
  sessionId: string;
  pid: number | null;
}

const FILE = "acp-agents.json";
const DIR = { baseDir: BaseDirectory.AppData };

const ACP_LAUNCH: Record<string, Pick<AcpAgent, "command" | "args">> = {
  "claude-code": { command: "claude-agent-acp", args: [] },
  codex: { command: "codex-acp", args: [] },
  gemini: { command: "gemini", args: ["--experimental-acp"] },
  qwen: { command: "qwen", args: ["--acp"] },
};

const ACP_CLI: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini",
  qwen: "qwen",
};

const ACP_NPX_PACKAGE: Partial<Record<AcpEngine, string>> = {
  // Pin the bridge: discovery must not turn a Connect click into an implicit
  // upgrade with behavior different from the version we verified.
  "claude-code": "@agentclientprotocol/claude-agent-acp@0.73.0",
  codex: "@agentclientprotocol/codex-acp",
};

const CONNECTED_PROVIDERS_KEY = "intellizen:acp-connected-providers";

export function defaultAcpLaunch(engine: AcpEngine): Pick<AcpAgent, "command" | "args"> {
  return ACP_LAUNCH[engine] ?? { command: engine, args: [] };
}

function isEngine(value: unknown): value is AcpEngine {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value);
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
    name: optionalString(row.name) ?? acpEngineLabel(row.engine),
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

function probeFor(probes: Map<string, AcpCommandProbe>, command: string): AcpCommandProbe | undefined {
  return probes.get(command);
}

function launchFor(
  engine: AcpEngine,
  probes: Map<string, AcpCommandProbe>,
): Pick<AcpAgent, "command" | "args"> & { adapterAvailable: boolean; cliAvailable: boolean; bridgeOnDemand: boolean } {
  const direct = defaultAcpLaunch(engine);
  const adapterAvailable = Boolean(probeFor(probes, direct.command)?.available);
  const cli = ACP_CLI[engine] ?? engine;
  const cliAvailable = Boolean(probeFor(probes, cli)?.available);
  const bridgePackage = ACP_NPX_PACKAGE[engine];
  const bridgeOnDemand = Boolean(bridgePackage && cliAvailable && probeFor(probes, "npx")?.available);
  if (adapterAvailable) return { ...direct, adapterAvailable, cliAvailable, bridgeOnDemand: false };
  if (bridgePackage && bridgeOnDemand) {
    return { command: "npx", args: ["--yes", bridgePackage], adapterAvailable, cliAvailable, bridgeOnDemand };
  }
  return { ...direct, adapterAvailable, cliAvailable, bridgeOnDemand: false };
}

/** Discover installed ACP agents from the official registry and local
 *  executable paths, then associate them with saved IntelliZen agents. The
 *  compatibility recipes are fallbacks, not a provider ceiling. */
export async function discoverAcpProviders(): Promise<AcpProviderDiscovery[]> {
  const [agents, native] = await Promise.all([
    listAcpAgents(),
    invoke<NativeAcpProvider[]>("acp_discover").catch(() => []),
  ]);
  const commands = [
    ...COMPATIBILITY_ENGINES.map((engine) => defaultAcpLaunch(engine).command),
    ...COMPATIBILITY_ENGINES.map((engine) => ACP_CLI[engine]),
    "npx",
    ...agents.map((agent) => agent.command),
  ];
  const probes = await probeAcpCommands(commands);
  const byCommand = new Map(probes.map((probe) => [probe.command, probe]));
  const nativeByEngine = new Map(native.map((provider) => [provider.id, provider]));
  const engines = [...new Set([
    ...native.map((provider) => provider.id),
    ...COMPATIBILITY_ENGINES,
    ...agents.map((agent) => agent.engine),
  ])];
  return engines.map((engine) => {
    const configured = agents.filter((agent) => agent.engine === engine);
    const registered = nativeByEngine.get(engine);
    const discovered = registered
      ? {
          command: registered.command,
          args: registered.args,
          adapterAvailable: !registered.source.toLowerCase().includes("bridge"),
          cliAvailable: true,
          bridgeOnDemand: registered.source.toLowerCase().includes("bridge"),
        }
      : launchFor(engine, byCommand);
    // The app-managed provider row follows the current verified launch
    // recipe. Preserve custom agent commands, but do not let an old generated
    // `provider-*` entry freeze discovery on an obsolete bridge invocation.
    const configuredLaunch = configured
      .filter((agent) => agent.id !== `provider-${engine}`)
      .map((agent) => ({ agent, probe: probeFor(byCommand, agent.command) }))
      .find(({ probe }) => probe?.available);
    const command = configuredLaunch?.agent.command ?? discovered.command;
    const args = configuredLaunch?.agent.args ?? discovered.args;
    const found = probeFor(byCommand, command);
    const available = Boolean(found?.available || discovered.adapterAvailable || discovered.bridgeOnDemand);
    const cliProbe = probeFor(byCommand, ACP_CLI[engine] ?? engine);
    return {
      engine,
      label: ACP_ENGINE_LABEL[engine] ?? registered?.name ?? acpEngineLabel(engine),
      ...(registered?.icon ? { icon: registered.icon } : {}),
      command,
      args,
      configured: configured.length,
      agentIds: configured.map((agent) => agent.id),
      ...(configuredLaunch ? { launchAgentId: configuredLaunch.agent.id } : {}),
      available: Boolean(registered || available),
      adapterAvailable: discovered.adapterAvailable,
      cliAvailable: discovered.cliAvailable,
      bridgeOnDemand: discovered.bridgeOnDemand,
      path: registered?.path ?? (discovered.bridgeOnDemand ? (cliProbe?.path ?? command) : (found?.path ?? cliProbe?.path ?? command)),
      source: registered?.source ?? "Compatibility probe",
    };
  }).filter((provider) => provider.available || provider.configured > 0);
}

function readConnectedProviders(): AcpEngine[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(CONNECTED_PROVIDERS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isEngine) : [];
  } catch {
    return [];
  }
}

function writeConnectedProviders(engines: AcpEngine[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONNECTED_PROVIDERS_KEY, JSON.stringify([...new Set(engines)]));
  } catch {
    /* A live connection still works when preference storage is unavailable. */
  }
}

function rememberProvider(engine: AcpEngine, connected: boolean) {
  const current = readConnectedProviders();
  writeConnectedProviders(connected ? [...current, engine] : current.filter((candidate) => candidate !== engine));
}

export function listAcpProviderStatuses(): Promise<AcpProviderStatus[]> {
  return invoke("acp_statuses");
}

function providerAgent(provider: AcpProviderDiscovery): AcpAgent {
  const { engine } = provider;
  return {
    id: `provider-${engine}`,
    name: provider.label,
    engine,
    command: provider.command,
    args: provider.args,
    role: `${provider.label} command-line agent`,
    avatarStyle: "sphere",
  };
}

/** Connect a discovered CLI. The first connection also creates the default
 *  provider agent that the Agents and chat surfaces need. */
export async function connectAcpProvider(provider: AcpProviderDiscovery): Promise<AcpProviderStatus> {
  if (!provider.available) throw new Error(`${provider.label} is not available on this computer.`);
  const agents = await readRegistry();
  const defaultId = `provider-${provider.engine}`;
  let agent = provider.launchAgentId
    ? agents.find((candidate) => candidate.id === provider.launchAgentId)
    : agents.find((candidate) => candidate.id === defaultId);
  if (!agent) {
    agent = providerAgent(provider);
    agents.push(agent);
    await writeRegistry(agents);
  } else if (agent.id === defaultId && (agent.command !== provider.command || JSON.stringify(agent.args) !== JSON.stringify(provider.args))) {
    agent = { ...agent, command: provider.command, args: provider.args };
    agents[agents.findIndex((candidate) => candidate.id === defaultId)] = agent;
    await writeRegistry(agents);
  }
  try {
    const started = await invoke<AcpProviderStatus>("acp_start", { agentId: agent.id });
    rememberProvider(provider.engine, true);
    return started;
  } catch (error) {
    rememberProvider(provider.engine, false);
    throw error;
  }
}

/** Stop every running agent backed by one provider, while keeping its agent
 *  configuration available for the next click. */
export async function disconnectAcpProvider(engine: AcpEngine): Promise<void> {
  const [agents, statuses] = await Promise.all([readRegistry(), listAcpProviderStatuses()]);
  const ids = new Set(agents.filter((agent) => agent.engine === engine).map((agent) => agent.id));
  await Promise.all(statuses.filter((status) => ids.has(status.agentId)).map((status) => invoke("acp_stop", { agentId: status.agentId })));
  rememberProvider(engine, false);
}

export async function disconnectAllAcpProviders(): Promise<void> {
  const statuses = await listAcpProviderStatuses();
  await Promise.all(statuses.map((status) => invoke("acp_stop", { agentId: status.agentId })));
  writeConnectedProviders([]);
}

/** Reopen only providers that were live when the app last stopped. */
export async function reconnectAcpProviders(): Promise<void> {
  const wanted = new Set(readConnectedProviders());
  if (!wanted.size) return;
  const providers = await discoverAcpProviders();
  await Promise.all(
    [...wanted].map(async (engine) => {
      const provider = providers.find((candidate) => candidate.engine === engine);
      if (!provider?.available) {
        rememberProvider(engine, false);
        return;
      }
      try {
        // Use the same path as a Connect click so generated provider agents
        // pick up a pinned bridge or newly discovered adapter on relaunch.
        await connectAcpProvider(provider);
      } catch {
        rememberProvider(engine, false);
      }
    }),
  );
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
