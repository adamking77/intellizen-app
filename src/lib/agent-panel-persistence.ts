import type { AgentChatWidget } from "@/lib/agent-widgets";
import type { ConversationContextSnapshot } from "@/lib/conversation-context";
import {
  migrateFionaPanelStorage,
  PANEL_SELECTED_ROLE_KEY,
  PANEL_START_ROLE_KEY,
  panelRoleStorageKey,
} from "@/lib/agent-panel-roles";

export const AGENT_PANEL_COLLAPSED_KEY = "intelizen:agent-panel-collapsed";
export const AGENT_PANEL_WIDTH_KEY = "intelizen:agent-panel-width";
export const LOCAL_CHAT_HISTORY_LIMIT = 40;

export type ChatEntryStatus =
  | "submitted"
  | "queued"
  | "failed"
  | "cancelled";

export interface AgentChatEntry {
  id: string;
  message: string;
  targetAgent: string;
  status: ChatEntryStatus;
  detail: string;
  createdAt: string;
  repliedAt?: string | null;
  reply?: string | null;
  widget?: AgentChatWidget | null;
  widgets?: AgentChatWidget[];
  context?: ConversationContextSnapshot | null;
}

export interface ChatTurn {
  id: string;
  role: "user" | "agent";
  speaker: string;
  text: string | null;
  widgets?: AgentChatWidget[];
  status?: ChatEntryStatus;
  detail?: string;
  context?: ConversationContextSnapshot | null;
  ts: string;
}

export function entriesToTurns(entries: AgentChatEntry[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const entry of entries) {
    turns.push({
      id: `${entry.id}-user`,
      role: "user",
      speaker: "You",
      text: entry.message,
      status: entry.status,
      detail: entry.detail,
      context: entry.context ?? null,
      ts: entry.createdAt,
    });
    const widgets = entry.widgets ?? (entry.widget ? [entry.widget] : []);
    if (entry.reply || widgets.length > 0 || entry.status === "cancelled") {
      turns.push({
        id: `${entry.id}-agent`,
        role: "agent",
        speaker: entry.targetAgent,
        text: entry.reply ?? null,
        widgets,
        status: entry.status === "cancelled" ? "cancelled" : undefined,
        detail: entry.status === "cancelled" ? entry.detail : undefined,
        ts: entry.repliedAt ?? entry.createdAt,
      });
    }
  }
  return turns
    .sort(
      (left, right) =>
        new Date(left.ts).getTime() - new Date(right.ts).getTime(),
    )
    .slice(-LOCAL_CHAT_HISTORY_LIMIT);
}

export function readAgentPanelCollapsed(
  storage: Pick<Storage, "getItem"> | null,
): boolean | null {
  const raw = storage?.getItem(AGENT_PANEL_COLLAPSED_KEY);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}

export function readInitialAgentPanelRole(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
) {
  if (!storage) return null;
  migrateFionaPanelStorage(storage);
  return (
    storage.getItem(PANEL_SELECTED_ROLE_KEY) ??
    storage.getItem(PANEL_START_ROLE_KEY)
  );
}

export function readAgentPanelValue(
  storage: Pick<Storage, "getItem"> | null,
  key: string,
  fallback = "",
) {
  return storage?.getItem(key) ?? fallback;
}

export function readAgentPanelChatHistory(
  storage: Pick<Storage, "getItem"> | null,
  roleKey: string | null,
) {
  if (!storage || !roleKey) return [];
  try {
    const parsed = JSON.parse(
      storage.getItem(panelRoleStorageKey(roleKey, "history")) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is AgentChatEntry =>
          Boolean(entry) &&
          typeof entry.id === "string" &&
          typeof entry.message === "string" &&
          typeof entry.targetAgent === "string" &&
          typeof entry.status === "string" &&
          typeof entry.detail === "string" &&
          typeof entry.createdAt === "string",
      )
      .slice(0, LOCAL_CHAT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function persistAgentPanelHistory(
  storage: Pick<Storage, "setItem">,
  roleKey: string,
  entries: AgentChatEntry[],
) {
  storage.setItem(
    panelRoleStorageKey(roleKey, "history"),
    JSON.stringify(entries.slice(0, LOCAL_CHAT_HISTORY_LIMIT)),
  );
}

export function persistAgentPanelDraft(
  storage: Pick<Storage, "setItem">,
  roleKey: string,
  draft: string,
) {
  storage.setItem(panelRoleStorageKey(roleKey, "draft"), draft);
}

export function appendToAgentPanelDraft(current: string, addition: string) {
  const trimmed = addition.trim();
  if (!trimmed) return current;
  return `${current.trim()}${current.trim() ? "\n\n" : ""}${trimmed}`;
}
