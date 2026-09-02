import { hermesRest } from "@/engine/rest";

export interface KanbanBoard {
  slug: string;
  name: string;
  description: string;
  isCurrent: boolean;
  total: number;
}

export interface KanbanCard {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
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
  return {
    id: text(result.task.id),
    title: text(result.task.title),
    status: text(result.task.status) || "todo",
    assignee: typeof result.task.assignee === "string" && result.task.assignee ? result.task.assignee : null,
  };
}
