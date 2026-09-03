import { hermesRest } from "@/engine/rest";

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

export async function listKanbanBoard(board: string): Promise<KanbanColumn[]> {
  const result = await hermesRest<{ columns?: Array<{ name?: unknown; tasks?: Record<string, unknown>[] }> }>(
    `${BASE}/board?board=${encodeURIComponent(board)}`,
  );
  return (result.columns ?? []).map((column) => ({
    name: text(column.name) || "todo",
    cards: (column.tasks ?? []).map((task) => ({
      id: text(task.id),
      title: text(task.title) || "Untitled card",
      status: text(task.status) || text(column.name) || "todo",
      assignee: typeof task.assignee === "string" && task.assignee ? task.assignee : null,
      projectId: typeof task.project_id === "string" && task.project_id ? task.project_id : null,
      latestSummary: typeof task.latest_summary === "string" && task.latest_summary ? task.latest_summary : null,
    })),
  }));
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
  const projectId = typeof result.task.project_id === "string" && result.task.project_id
    ? result.task.project_id
    : null;
  const latestSummary = typeof result.task.latest_summary === "string" && result.task.latest_summary
    ? result.task.latest_summary
    : null;
  return {
    id: text(result.task.id),
    title: text(result.task.title),
    status: text(result.task.status) || "todo",
    assignee: typeof result.task.assignee === "string" && result.task.assignee ? result.task.assignee : null,
    ...(projectId ? { projectId } : {}),
    ...(latestSummary ? { latestSummary } : {}),
  };
}
