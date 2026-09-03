// Reading and writing agents through their doors: Hermes profiles over the
// gateway (`profiles.*`) and REST (delete), ACP entries through the registry.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import { deleteAcpAgent, discoverAcpProviders, listAcpAgents, saveAcpAgent, type AcpAgent } from "@/engine/acp-registry";
import { request, type GatewayClientLike } from "@/engine/contract";
import { hermesRest } from "@/engine/rest";
import { levelOf } from "@/voice/dictation";

import {
  acpFromAgent,
  agentFromAcp,
  agentFromProfileRow,
  asVoiceService,
  profileOf,
  sortAgents,
  toUiMeta,
  UI_META_KEY,
  type Agent,
  type VoiceService,
} from "./agent-model";

export interface AgentList {
  agents: Agent[];
  /** Why the ACP registry could not be read, when it could not. Hermes
   *  profiles still list; the page says the rest is missing rather than
   *  showing nothing. */
  acpTrouble: string | null;
  /** The raw ACP entries, so an edit keeps the launch fields it does not show. */
  acpEntries: AcpAgent[];
}

export async function listAgents(client: GatewayClientLike, includeHermes = true): Promise<AgentList> {
  const result = includeHermes
    ? await request<{ profiles?: Record<string, unknown>[] }>(client, "profiles.list", { include_sessions: false })
    : null;
  const hermes = (Array.isArray(result?.profiles) ? result.profiles : []).map(agentFromProfileRow).filter((a): a is Agent => a !== null);
  let acpEntries: AcpAgent[] = [];
  let acpTrouble: string | null = null;
  try {
    acpEntries = await listAcpAgents();
  } catch (error) {
    acpTrouble = error instanceof Error ? error.message : String(error);
  }
  return { agents: sortAgents([...hermes, ...acpEntries.map(agentFromAcp)]), acpTrouble, acpEntries };
}

interface DescribeResult {
  soul?: unknown;
  description?: unknown;
  model?: { provider?: unknown; default?: unknown };
}

/** The fields `profiles.list` does not carry: SOUL.md, the pinned model and
 *  the voice (`voice_of_profile` reads the profile's config.yaml). */
export async function describeHermesAgent(
  client: GatewayClientLike,
  agent: Agent,
): Promise<Pick<Agent, "identity" | "provider" | "model" | "voiceId" | "voiceService">> {
  const name = profileOf(agent.id);
  if (!name) return { identity: agent.identity, provider: agent.provider, model: agent.model, voiceId: agent.voiceId, voiceService: agent.voiceService };
  const [r, voice] = await Promise.all([
    request<DescribeResult>(client, "profiles.describe", { name }),
    invoke<{ service?: string; voice_id?: string }>("voice_of_profile", { profile: name }).catch(
      (): { service?: string; voice_id?: string } => ({}),
    ),
  ]);
  return {
    identity: typeof r.soul === "string" ? r.soul : "",
    provider: typeof r.model?.provider === "string" ? r.model.provider : agent.provider,
    model: typeof r.model?.default === "string" ? r.model.default : agent.model,
    voiceId: voice.voice_id || undefined,
    voiceService: asVoiceService(voice.service),
  };
}

/** `tts.provider` and `tts.<service>.voice_id` in the profile's config.yaml,
 *  through the dashboard's `PUT /api/config?profile=`, which deep-merges and
 *  leaves the rest of the file alone. The gateway's `config.set` knows no
 *  tts keys at this pin, so REST is the door. */
export async function saveVoice(profile: string, service: VoiceService, voiceId: string): Promise<void> {
  await hermesRest("/api/config", {
    method: "PUT",
    body: JSON.stringify({ profile, config: { tts: { provider: service, [service]: { voice_id: voiceId } } } }),
  });
}

/** Say one line in this voice and expose its measured playback amplitude so
 *  the editor's avatar moves with the sound, exactly like chat. */
export async function previewVoice(
  text: string,
  _service: VoiceService | undefined,
  voiceId: string | undefined,
  onLevel?: (level: number) => void,
): Promise<void> {
  const path = await invoke<string>("voice_prepare", { text, voice: voiceId || null, model: null });
  if (!path) return;
  const element = new Audio(convertFileSrc(path));
  let frameId = 0;
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaElementSource(element).connect(analyser);
    analyser.connect(context.destination);
    const samples = new Float32Array(analyser.fftSize);
    const watch = () => {
      analyser.getFloatTimeDomainData(samples);
      onLevel?.(levelOf(samples));
      frameId = window.requestAnimationFrame(watch);
    };
    frameId = window.requestAnimationFrame(watch);
  } catch {
    // Speaking still works when Web Audio is unavailable; only the measured
    // avatar response is omitted.
  }
  try {
    await new Promise<void>((resolve) => {
      element.onended = () => resolve();
      element.onerror = () => resolve();
      void element.play().catch(() => resolve());
    });
  } finally {
    window.cancelAnimationFrame(frameId);
    void context?.close();
    onLevel?.(0);
  }
}

/** The profile's picture as a data URL, or null when it has none. */
export async function loadAvatar(client: GatewayClientLike, agent: Agent): Promise<string | null> {
  const name = profileOf(agent.id);
  if (!name || !agent.hasAvatar) return null;
  const r = await request<{ found?: boolean; data?: string }>(client, "profiles.get_asset", { name, asset: "avatar" });
  return r.found && typeof r.data === "string" ? r.data : null;
}

export async function setAvatar(client: GatewayClientLike, agent: Agent, dataUrl: string | null): Promise<void> {
  const name = profileOf(agent.id);
  if (!name) throw new Error("Only a Hermes profile keeps a picture.");
  await request(client, "profiles.set_asset", dataUrl ? { name, asset: "avatar", data: dataUrl } : { name, asset: "avatar", clear: true });
}

/** Hermes refused a model until the person confirms its cost or data policy. */
export class ModelConfirmRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfirmRequired";
  }
}

interface ConfigureResult {
  ok?: boolean;
  applied?: Record<string, unknown>;
  confirm_required?: boolean;
  confirm_message?: string;
}

function failedSections(applied: Record<string, unknown> | undefined): string[] {
  return Object.entries(applied ?? {})
    .filter(([key, value]) => value === false && !key.startsWith("ui_meta_"))
    .map(([key]) => key);
}

export interface SaveOptions {
  creating: boolean;
  /** Resend a model pin Hermes asked to confirm. */
  confirmModel?: boolean;
  /** The ACP entry being edited, so its launch fields survive. */
  previousAcp?: AcpAgent;
}

/** Save through the right door. Returns the agent as it now is (the id of a
 *  new Hermes profile is its name). */
export async function saveAgent(client: GatewayClientLike, agent: Agent, options: SaveOptions): Promise<Agent> {
  if (agent.engine !== "hermes") {
    const discovered = options.previousAcp
      ? undefined
      : (await discoverAcpProviders()).find((provider) => provider.engine === agent.engine);
    const launch = options.previousAcp ?? (discovered ? { command: discovered.command, args: discovered.args } : undefined);
    const saved = await saveAcpAgent(acpFromAgent(agent, launch));
    return agentFromAcp(saved);
  }

  const name = options.creating ? agent.name.trim() : (profileOf(agent.id) ?? agent.name.trim());
  const modelPin = agent.model.trim() && agent.provider.trim() ? { model: agent.model.trim(), provider: agent.provider.trim() } : {};

  if (options.creating) {
    await request(client, "profiles.create", {
      name,
      description: agent.role.trim() || undefined,
      soul: agent.identity || undefined,
      ...modelPin,
    });
  }

  const params: Record<string, unknown> = {
    name,
    ui_meta: { [UI_META_KEY]: toUiMeta(agent) },
  };
  if (!options.creating) {
    params.soul = agent.identity;
    params.description = agent.role.trim();
    Object.assign(params, modelPin);
    if (options.confirmModel) params.confirm_expensive_model = true;
  }
  const r = await request<ConfigureResult>(client, "profiles.configure", params);
  if (r.confirm_required) throw new ModelConfirmRequired(r.confirm_message ?? "Hermes wants this model confirmed.");
  const failed = failedSections(r.applied);
  if (failed.length) throw new Error(`Hermes could not save: ${failed.join(", ")}.`);
  if (agent.voiceId && agent.voiceService) await saveVoice(name, agent.voiceService, agent.voiceId);
  return { ...agent, id: `hermes:${name}`, name, displayName: agent.displayName || name };
}

export async function deleteAgent(agent: Agent): Promise<void> {
  const name = profileOf(agent.id);
  if (name) {
    // No gateway method deletes a profile; the dashboard's REST route does.
    await hermesRest(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
    return;
  }
  await deleteAcpAgent(agent.id.replace(/^acp:/, ""));
}
