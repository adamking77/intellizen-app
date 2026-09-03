import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { QueryState } from "@/components/ui/query-state";
import { boardsForProject } from "@/lib/project-room";
import { listKanbanBoard, listKanbanBoards } from "@/services/hermes-kanban";

const COLUMN_LABELS: Record<string, string> = {
  triage: "Triage",
  todo: "To do",
  scheduled: "Scheduled",
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export function ProjectBoard({ folders }: { folders: string[] }) {
  const boards = useQuery({ queryKey: ["kanban-boards", "project-room"], queryFn: listKanbanBoards });
  const scoped = boardsForProject(boards.data ?? [], folders);
  const boardData = useQuery({
    queryKey: ["kanban-project-room", scoped.map((board) => board.slug)],
    queryFn: async () => Promise.all(scoped.map(async (board) => ({ board, columns: await listKanbanBoard(board.slug) }))),
    enabled: scoped.length > 0,
  });

  return (
    <ProjectTabFrame>
      <QueryState
        isLoading={boards.isLoading || (scoped.length > 0 && boardData.isLoading)}
        error={boards.error ?? boardData.error}
        isEmpty={scoped.length === 0}
        loadingLabel="Loading project board"
        errorTitle="Project board unavailable"
        emptyTitle="No board linked to this project"
        emptyDescription={folders.length === 0
          ? "Add a project folder to connect its Hermes board."
          : "Hermes boards linked to this project's folder appear here."}
        onRetry={() => void (boards.error ? boards.refetch() : boardData.refetch())}
      >
        <div className="space-y-6">
          {(boardData.data ?? []).map(({ board, columns }) => (
            <section key={board.slug} aria-label={board.name}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">{board.name}</h2>
                <span className="font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{board.total} cards</span>
              </div>
              <div className="flex min-w-0 gap-3 overflow-x-auto pb-2">
                {columns.map((column) => (
                  <div key={column.name} className="w-56 shrink-0">
                    <div className="mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                      <span className="text-label">{COLUMN_LABELS[column.name] ?? column.name}</span>
                      <span className="rounded-[var(--r-pill)] border border-[var(--border)] px-1.5 py-0.5 font-mono text-[var(--t-count)] text-[var(--overlay-1)]">
                        {column.cards.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {column.cards.map((card) => (
                        <article key={card.id} className="rounded-[var(--r-plane)] border border-[var(--border)] bg-[var(--surface-wash)] p-3">
                          <p className="font-ui text-[var(--t-meta)] font-medium leading-5 text-[var(--text)]">{card.title}</p>
                          {card.latestSummary ? (
                            <p className="mt-1 line-clamp-2 font-ui text-[var(--t-section)] leading-4 text-[var(--subtext-0)]">{card.latestSummary}</p>
                          ) : null}
                          {card.assignee ? <p className="mt-2 text-meta">{card.assignee}</p> : null}
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </QueryState>
    </ProjectTabFrame>
  );
}

export function ProjectTabFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>;
}
