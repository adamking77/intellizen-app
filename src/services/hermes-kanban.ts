import { hermesRest } from "@/engine/rest";
import type { EngineInfo } from "@/engine/engine";
import { useEngineStore } from "@/engine/engine-store";

export interface KanbanBoard {
  slug: string;
  name: string;
  description: string;
  isCurrent: boolean;
  total: number;
  projectId: string | null;
  defaultWorkdir: string | null;
}

export interface KanbanCard {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  projectId?: string | null;
  latestSummary?: string | null;
}

export interface KanbanColumn {
  name: string;
  cards: KanbanCard[];
}

export interface KanbanBoardSnapshot {
  columns: KanbanColumn[];
  latestEventId: number;
}

export interface KanbanEvent {
  id: number;
  taskId: string;
  kind: string;
}

export interface KanbanCardCreate {
  title: string;
  body?: string;
  assignee?: string | null;
  priority?: number;
  idempotencyKey?: string;
}

const BASE = "/api/plugins/kanban";

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export async function listKanbanBoards(): Promise<KanbanBoard[]> {
  const result = await hermesRest<{ boards?: Record<string, unknown>[] }>(`${BASE}/boards`);
  return (result.boards ?? []).map((row) => ({
    slug: text(row.slug),
    name: text(row.name) || text(row.slug),
    description: text(row.description),
    isCurrent: row.is_current === true,
    total: typeof row.total === "number" ? row.total : 0,
    projectId: typeof row.project_id === "string" && row.project_id ? row.project_id : null,
    defaultWorkdir: typeof row.default_workdir === "string" && row.default_workdir ? row.default_workdir : null,
  }));
}

function toKanbanCard(task: Record<string, unknown>, fallbackStatus = "todo"): KanbanCard {
  return {
    id: text(task.id),
    title: text(task.title) || "Untitled card",
    status: text(task.status) || fallbackStatus,
    assignee: typeof task.assignee === "string" && task.assignee ? task.assignee : null,
    projectId: typeof task.project_id === "string" && task.project_id ? task.project_id : null,
    latestSummary: typeof task.latest_summary === "string" && task.latest_summary ? task.latest_summary : null,
  };
}

export async function getKanbanBoard(board: string): Promise<KanbanBoardSnapshot> {
  const result = await hermesRest<{
    columns?: Array<{ name?: unknown; tasks?: Record<string, unknown>[] }>;
    latest_event_id?: unknown;
  }>(
    `${BASE}/board?board=${encodeURIComponent(board)}`,
  );
  return {
    columns: (result.columns ?? []).map((column) => ({
      name: text(column.name) || "todo",
      cards: (column.tasks ?? []).map((task) => toKanbanCard(task, text(column.name) || "todo")),
    })),
    latestEventId: Number(result.latest_event_id ?? 0) || 0,
  };
}

export async function listKanbanBoard(board: string): Promise<KanbanColumn[]> {
  return (await getKanbanBoard(board)).columns;
}

export async function createKanbanCard(board: string, card: KanbanCardCreate): Promise<KanbanCard> {
  const result = await hermesRest<{ task?: Record<string, unknown> | null }>(
    `${BASE}/tasks?board=${encodeURIComponent(board)}`,
    {
      method: "POST",
      body: JSON.stringify({
        title: card.title,
        body: card.body ?? null,
        assignee: card.assignee ?? null,
        priority: card.priority ?? 0,
        triage: false,
        idempotency_key: card.idempotencyKey ?? null,
      }),
    },
  );
  if (!result.task) throw new Error("Kanban returned no card");
  return toKanbanCard(result.task);
}

export async function moveKanbanCard(board: string, cardId: string, status: string): Promise<KanbanCard> {
  const result = await hermesRest<{ task?: Record<string, unknown> | null }>(
    `${BASE}/tasks/${encodeURIComponent(cardId)}?board=${encodeURIComponent(board)}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  if (!result.task) throw new Error("Kanban returned no card");
  return toKanbanCard(result.task);
}

export function kanbanEventsUrl(
  info: Pick<EngineInfo, "port" | "token">,
  board: string,
  since: number,
): string {
  const query = new URLSearchParams({ token: info.token, board, since: String(since) });
  return `ws://127.0.0.1:${info.port}${BASE}/events?${query.toString()}`;
}

type KanbanSocket = Pick<WebSocket, "close" | "onclose" | "onmessage">;

export function subscribeKanbanEvents(
  board: string,
  since: number,
  onEvents: (events: KanbanEvent[]) => void,
  socketFactory: (url: string) => KanbanSocket = (url) => new WebSocket(url),
): () => void {
  let cursor = since;
  let stopped = false;
  let socket: KanbanSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (stopped) return;
    const info = useEngineStore.getState().info;
    if (!info) {
      reconnect = setTimeout(open, 1_000);
      return;
    }
    socket = socketFactory(kanbanEventsUrl(info, board, cursor));
    socket.onmessage = (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as {
          cursor?: unknown;
          events?: Array<{ id?: unknown; task_id?: unknown; kind?: unknown }>;
        };
        cursor = Number(payload.cursor ?? cursor) || cursor;
        const events = (payload.events ?? []).flatMap((event) => {
          const id = Number(event.id ?? 0) || 0;
          const taskId = text(event.task_id);
          return id && taskId ? [{ id, taskId, kind: text(event.kind) }] : [];
        });
        if (events.length) onEvents(events);
      } catch {
        // Ignore malformed frames; the next valid cursor remains lossless.
      }
    };
    socket.onclose = () => {
      if (!stopped) reconnect = setTimeout(open, 1_000);
    };
  };
  open();
  return () => {
    stopped = true;
    if (reconnect) clearTimeout(reconnect);
    socket?.close();
  };
}
