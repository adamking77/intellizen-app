import { hermesRest } from "@/engine/rest";
import { request, type GatewayClientLike } from "@/engine/contract";
import { getGatewayClient } from "@/engine/gateway";
import { listProfiles } from "@/engine/profiles";
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
  failed: boolean;
  toolCallCount: number;
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
  tool_call_count?: unknown;
  end_reason?: unknown;
}

interface HermesProjectResult {
  project?: {
    id?: unknown;
    repos?: Array<{ groups?: Array<{ sessions?: RawSession[] }> }>;
  } | null;
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

function normalizeSessions(rows: RawSession[]): HermesProjectSession[] {
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
      failed: /error|fail|crash/i.test(string(row.end_reason)),
      toolCallCount: Number(row.tool_call_count ?? 0) || 0,
    }];
  });
  return sessions.sort((left, right) => right.lastActive - left.lastActive);
}

export async function listHermesSidebarSessions(): Promise<HermesProjectSession[]> {
  const query = new URLSearchParams({
    recents_profile: "all",
    recents_limit: "500",
    recents_exclude: "cron,kanban,tool",
    cron_limit: "1",
    messaging_limit: "1",
  });
  const result = await hermesRest<{ recents?: { sessions?: RawSession[] } }>(
    `/api/profiles/sessions/sidebar?${query.toString()}`,
  );
  return normalizeSessions(result.recents?.sessions ?? []);
}

export async function listHermesProjectSessions(
  folders: string[],
  client: GatewayClientLike = getGatewayClient(),
): Promise<HermesProjectSession[]> {
  if (folders.length === 0) return [];
  const profiles = await listProfiles(client);
  const rows = await Promise.all(profiles.flatMap((profile) => folders.map(async (cwd) => {
    const resolved = await request<{ project?: { id?: unknown } | null }>(client, "projects.for_cwd", {
      profile: profile.name,
      cwd,
    });
    const projectId = string(resolved.project?.id) || cwd;
    const result = await request<HermesProjectResult>(client, "projects.project_sessions", {
      profile: profile.name,
      project_id: projectId,
    });
    return result.project?.repos?.flatMap((repo) =>
      repo.groups?.flatMap((group) => group.sessions ?? []) ?? []
    ) ?? [];
  })));
  return sessionsForProject(normalizeSessions(rows.flat()), folders);
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
