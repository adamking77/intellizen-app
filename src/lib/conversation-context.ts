export const CONVERSATION_CONTEXT_VERSION = 1 as const;
export const CONVERSATION_CONTEXT_STORAGE_KEY = "intelizen:conversation-context";
export const CONVERSATION_CONTEXT_CHANNEL = "intelizen:conversation-context";

export interface ConversationRouteReference {
  kind: "route";
  pathname: string;
  search: string;
  hash: string;
}

export type ConversationContextSelection =
  | { kind: "workspace_record"; databaseId: string; recordId: string; label?: string }
  | { kind: "workflow_run"; workflowRunId: string; label?: string }
  | { kind: "investigation"; caseId: string; label?: string }
  | { kind: "document"; documentId: string; label?: string };

export interface ConversationContextSnapshot {
  version: typeof CONVERSATION_CONTEXT_VERSION;
  source: "main-app";
  route: ConversationRouteReference;
  selections: ConversationContextSelection[];
  updatedAt: string;
}

interface RouteLocationInput {
  pathname: string;
  search?: string;
  hash?: string;
}

function normalizeSuffix(value: string | undefined, prefix: "?" | "#") {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
}

export function createRouteConversationContext(
  location: RouteLocationInput,
  updatedAt = new Date().toISOString(),
): ConversationContextSnapshot {
  const pathname = location.pathname.trim() || "/";
  return {
    version: CONVERSATION_CONTEXT_VERSION,
    source: "main-app",
    route: {
      kind: "route",
      pathname: pathname.startsWith("/") ? pathname : `/${pathname}`,
      search: normalizeSuffix(location.search, "?"),
      hash: normalizeSuffix(location.hash, "#"),
    },
    selections: [],
    updatedAt,
  };
}

export function parseConversationContext(value: unknown): ConversationContextSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ConversationContextSnapshot>;
  const route = candidate.route;
  if (
    candidate.version !== CONVERSATION_CONTEXT_VERSION ||
    candidate.source !== "main-app" ||
    !route ||
    route.kind !== "route" ||
    typeof route.pathname !== "string" ||
    typeof route.search !== "string" ||
    typeof route.hash !== "string" ||
    !Array.isArray(candidate.selections) ||
    !candidate.selections.every(isConversationContextSelection) ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }
  return candidate as ConversationContextSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recover the exact app snapshot carried by an agent-chat payload.
 *
 * Durable Fiona inbox rows store the chat envelope at the top level and the
 * app-owned context snapshot under `context.payload.conversation_context`.
 * Keeping this adapter here gives both transport paths one validation gate.
 */
export function conversationContextFromChatPayload(value: unknown): ConversationContextSnapshot | null {
  if (!isRecord(value)) return null;
  const agentContext = value.context;
  if (!isRecord(agentContext) || !isRecord(agentContext.payload)) return null;
  return parseConversationContext(agentContext.payload.conversation_context);
}

function isConversationContextSelection(value: unknown): value is ConversationContextSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selection = value as Record<string, unknown>;
  const hasOptionalLabel = selection.label === undefined || typeof selection.label === "string";
  if (!hasOptionalLabel) return false;
  if (selection.kind === "workspace_record") {
    return typeof selection.databaseId === "string" && typeof selection.recordId === "string";
  }
  if (selection.kind === "workflow_run") return typeof selection.workflowRunId === "string";
  if (selection.kind === "investigation") return typeof selection.caseId === "string";
  if (selection.kind === "document") return typeof selection.documentId === "string";
  return false;
}

export function deserializeConversationContext(value: string | null): ConversationContextSnapshot | null {
  if (!value) return null;
  try {
    return parseConversationContext(JSON.parse(value));
  } catch {
    return null;
  }
}

export function readConversationContext(): ConversationContextSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return deserializeConversationContext(window.localStorage.getItem(CONVERSATION_CONTEXT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function publishConversationContext(snapshot: ConversationContextSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONVERSATION_CONTEXT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // A live BroadcastChannel can still carry the update when storage is unavailable.
  }
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CONVERSATION_CONTEXT_CHANNEL);
    channel.postMessage(snapshot);
    channel.close();
  } catch {
    // Cross-window context is optional plumbing; route rendering must not fail with it.
  }
}

export function subscribeConversationContext(listener: (snapshot: ConversationContextSnapshot) => void) {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CONVERSATION_CONTEXT_STORAGE_KEY) return;
    const snapshot = deserializeConversationContext(event.newValue);
    if (snapshot) listener(snapshot);
  };
  window.addEventListener("storage", onStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CONVERSATION_CONTEXT_CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const snapshot = parseConversationContext(event.data);
        if (snapshot) listener(snapshot);
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
