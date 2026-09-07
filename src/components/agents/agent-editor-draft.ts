import type { Agent } from "./agent-model";

const PREFIX = "intelizen:agent-editor-draft:";
const fallback = new Map<string, string>();
const AGENT_FIELDS = new Set<keyof Agent>([
  "id", "name", "displayName", "role", "engine", "provider", "model", "identity",
  "context", "avatarStyle", "avatarSeed", "avatarKind", "avatarColor", "hasAvatar",
  "voiceId", "voiceService", "isDefault", "description",
]);

export interface StoredAgentEditorDraft {
  draft: Agent;
  touched: (keyof Agent)[];
}

export function agentEditorDraftKey(agentId: string, creating: boolean) {
  return `${PREFIX}${encodeURIComponent(creating ? "new-agent" : agentId)}`;
}

function validAgent(value: unknown): value is Agent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const agent = value as Partial<Agent>;
  return [
    agent.id,
    agent.name,
    agent.displayName,
    agent.role,
    agent.engine,
    agent.provider,
    agent.model,
    agent.identity,
    agent.description,
  ].every((field) => typeof field === "string")
    && Array.isArray(agent.context)
    && agent.context.every((path) => typeof path === "string")
    && ["sphere", "blob", "trace"].includes(String(agent.avatarStyle))
    && typeof agent.hasAvatar === "boolean"
    && typeof agent.isDefault === "boolean";
}

export function readAgentEditorDraft(agentId: string, creating: boolean): StoredAgentEditorDraft | null {
  const key = agentEditorDraftKey(agentId, creating);
  let raw = fallback.get(key) ?? null;
  if (raw === null) {
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as { version?: unknown; draft?: unknown; touched?: unknown };
    if (stored.version !== 1 || !validAgent(stored.draft) || (!creating && stored.draft.id !== agentId)
      || !Array.isArray(stored.touched) || !stored.touched.every((field): field is keyof Agent => typeof field === "string" && AGENT_FIELDS.has(field as keyof Agent))) return null;
    return { draft: stored.draft, touched: [...new Set(stored.touched)] };
  } catch {
    return null;
  }
}

export function writeAgentEditorDraft(agentId: string, creating: boolean, draft: Agent, touched: Iterable<keyof Agent>) {
  const key = agentEditorDraftKey(agentId, creating);
  const raw = JSON.stringify({ version: 1, draft, touched: [...touched] });
  try {
    window.localStorage.setItem(key, raw);
    fallback.delete(key);
  } catch {
    fallback.set(key, raw);
  }
}

export function clearAgentEditorDraft(agentId: string, creating: boolean, expected?: Agent) {
  const key = agentEditorDraftKey(agentId, creating);
  if (expected && JSON.stringify(readAgentEditorDraft(agentId, creating)?.draft) !== JSON.stringify(expected)) return;
  fallback.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // A failed removal must not resurrect the saved copy in this window.
    fallback.set(key, "");
  }
}
