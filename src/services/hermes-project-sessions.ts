import { hermesRest } from "@/engine/rest";
import { sessionsForProject } from "@/lib/project-room";

export interface HermesProjectSession {
  id: string;
  title: string;
  preview: string;
  profile: string;
  cwd: string | null;
  source: string | null;
  lastActive: number;
  messageCount: number;
}

export interface HermesStoredMessage {
  id: string;
  role: "assistant" | "system" | "tool" | "user";
  text: string;
  name: string | null;
  timestamp: number | null;
}

interface RawSession {
  id?: unknown;
  title?: unknown;
  preview?: unknown;
  profile?: unknown;
  cwd?: unknown;
  source?: unknown;
  last_active?: unknown;
  started_at?: unknown;
  message_count?: unknown;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function messageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(messageText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return messageText(row.text ?? row.content ?? row.output ?? row.result);
}

export async function listHermesSessions(): Promise<HermesProjectSession[]> {
  const rows: RawSession[] = [];
  const pageSize = 500; // Hermes caps this endpoint at 500 rows per request.
  let offset = 0;
  let total = 0;
  do {
    const query = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
      min_messages: "1",
      archived: "exclude",
      order: "recent",
      profile: "all",
      exclude_sources: "cron,kanban,tool",
    });
    const result = await hermesRest<{ sessions?: RawSession[]; total?: number }>(
      `/api/profiles/sessions?${query.toString()}`,
    );
    const page = result.sessions ?? [];
    rows.push(...page);
    total = Number(result.total ?? page.length) || page.length;
    offset += pageSize;
    if (page.length === 0) break;
  } while (offset < total);

  const seen = new Set<string>();
  const sessions = rows.flatMap((row) => {
    const id = string(row.id);
    const profile = string(row.profile) || "default";
    const key = `${profile}:${id}`;
    if (!id || seen.has(key)) return [];
    seen.add(key);
    return [{
      id,
      title: string(row.title) || "Untitled session",
      preview: string(row.preview),
      profile,
      cwd: string(row.cwd) || null,
      source: string(row.source) || null,
      lastActive: Number(row.last_active ?? row.started_at ?? 0) || 0,
      messageCount: Number(row.message_count ?? 0) || 0,
    }];
  });
  return sessions.sort((left, right) => right.lastActive - left.lastActive);
}

export async function listHermesProjectSessions(folders: string[]): Promise<HermesProjectSession[]> {
  if (folders.length === 0) return [];
  return sessionsForProject(await listHermesSessions(), folders);
}

export async function getHermesSessionMessages(
  sessionId: string,
  profile: string,
): Promise<HermesStoredMessage[]> {
  const query = new URLSearchParams({
    profile,
    limit: "500",
    offset: "0",
    order: "latest",
    include_compacted: "true",
  });
  const result = await hermesRest<{ messages?: Array<Record<string, unknown>> }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`,
  );
  return (result.messages ?? []).flatMap((row, index) => {
    const role = string(row.role);
    if (role !== "assistant" && role !== "system" && role !== "tool" && role !== "user") return [];
    const text = messageText(row.display_content ?? row.content ?? row.text);
    if (!text.trim()) return [];
    return [{
      id: String(row.row_id ?? row.id ?? `${role}-${index}`),
      role,
      text,
      name: string(row.name ?? row.tool_name) || null,
      timestamp: typeof row.timestamp === "number" ? row.timestamp : null,
    }];
  });
}
