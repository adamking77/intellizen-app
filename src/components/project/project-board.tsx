import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Control } from "@/components/ui/control";
import { Drawer } from "@/components/ui/drawer";
import { Identity } from "@/components/ui/identity";
import { QueryState } from "@/components/ui/query-state";
import { Receipt } from "@/components/ui/receipt";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ui/status-pill";
import { boardsForProject } from "@/lib/project-room";
import { errorMessage, toast } from "@/lib/toast";
import { runViewTransition } from "@/lib/view-transitions";
import {
  getKanbanBoard,
  getKanbanCardDetail,
  listKanbanBoards,
  moveKanbanCard,
  subscribeKanbanEvents,
  type KanbanCard,
  type KanbanCardDetail,
} from "@/services/hermes-kanban";

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
  const [selected, setSelected] = useState<(KanbanCard & { board: string; boardSlug: string }) | null>(null);
  const [moving, setMoving] = useState(false);
  const boards = useQuery({ queryKey: ["kanban-boards", "project-room"], queryFn: listKanbanBoards });
  const scoped = boardsForProject(boards.data ?? [], folders);
  const boardData = useQuery({
    queryKey: ["kanban-project-room", scoped.map((board) => board.slug)],
    queryFn: async () => Promise.all(scoped.map(async (board) => ({ board, snapshot: await getKanbanBoard(board.slug) }))),
    enabled: scoped.length > 0,
  });
  const cardDetail = useQuery({
    queryKey: ["kanban-card", selected?.boardSlug, selected?.id],
    queryFn: () => getKanbanCardDetail(selected!.boardSlug, selected!.id),
    enabled: selected != null,
  });
  const openCard = selected ? { ...selected, ...(cardDetail.data ?? {}) } : null;

  useEffect(() => {
    const close = (boardData.data ?? []).map(({ board, snapshot }) =>
      subscribeKanbanEvents(board.slug, snapshot.latestEventId, () => void boardData.refetch())
    );
    return () => close.forEach((stop) => stop());
  }, [boardData.data]);

  async function move(status: string) {
    if (!selected || status === selected.status) return;
    setMoving(true);
    try {
      const updated = await moveKanbanCard(selected.boardSlug, selected.id, status);
      setSelected({ ...selected, ...updated });
      await Promise.all([boardData.refetch(), cardDetail.refetch()]);
      toast.success(`Moved to ${COLUMN_LABELS[updated.status] ?? updated.status}`);
    } catch (error) {
      toast.error("Couldn't move card", { description: errorMessage(error) });
    } finally {
      setMoving(false);
    }
  }

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
          {(boardData.data ?? []).map(({ board, snapshot }) => (
            <section key={board.slug} aria-label={board.name}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">{board.name}</h2>
                <span className="font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{board.total} cards</span>
              </div>
              <div className="flex min-w-0 gap-3 overflow-x-auto pb-2">
                {snapshot.columns.map((column) => (
                  <div key={column.name} className="w-56 shrink-0">
                    <div className="mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                      <span className="text-label">{COLUMN_LABELS[column.name] ?? column.name}</span>
                      <Pill>{column.cards.length} cards</Pill>
                    </div>
                    <div className="space-y-2">
                      {column.cards.map((card) => (
                        <button key={card.id} type="button" className="block w-full text-left" onClick={(event) => runViewTransition("drawer", () => setSelected({ ...card, board: board.name, boardSlug: board.slug }), event.currentTarget)}>
                          <Card selected={selected?.id === card.id}>
                          <p className="font-ui text-[var(--t-meta)] font-medium leading-5 text-[var(--text)]">{card.title}</p>
                          {card.latestSummary ? (
                            <p className="mt-1 line-clamp-2 font-ui text-[var(--t-section)] leading-4 text-[var(--text-muted)]">{card.latestSummary}</p>
                          ) : null}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            {card.assignee ? <Identity name={card.assignee} runtime="hermes" /> : <span className="text-[var(--t-meta)] text-[var(--text-muted)]">—</span>}
                            <Pill>{COLUMN_LABELS[card.status] ?? card.status}</Pill>
                          </div>
                          </Card>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </QueryState>
      <Drawer open={openCard != null} onClose={() => setSelected(null)} label={openCard?.title ?? "Card details"}>
        {openCard ? (
          <div className="grid gap-5 p-4">
            <div>
              <div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">Card · {openCard.status}</div>
              <h2 className="mt-1 text-[var(--t-title)] text-[var(--text)]">{openCard.title}</h2>
              <div className="mt-2">{openCard.assignee ? <Identity name={openCard.assignee} runtime="hermes" /> : <span className="text-[var(--t-meta)] text-[var(--text-muted)]">— unassigned</span>}</div>
            </div>
            {cardDetail.isLoading ? <Skeleton lines={4} /> : cardDetail.error ? (
              <div role="alert" className="text-[var(--t-meta)] text-[var(--bad)]">
                Full card details could not be read. <button type="button" className="underline" onClick={() => void cardDetail.refetch()}>Retry</button>
              </div>
            ) : cardDetail.data ? <CardDetailSections card={cardDetail.data} /> : null}
            {!cardDetail.data && openCard.latestSummary ? <p className="text-[var(--t-ui)] leading-relaxed text-[var(--text)]">{openCard.latestSummary}</p> : null}
            <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-[var(--t-meta)]">
              <dt className="text-[var(--text-muted)]">Board</dt><dd>{openCard.board}</dd>
              <dt className="text-[var(--text-muted)]">State</dt><dd><Pill>{openCard.status}</Pill></dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Select aria-label="Move card" disabled={moving} value={openCard.status} onChange={(event) => void move(event.target.value)}>
                {Object.entries(COLUMN_LABELS).filter(([status]) => status !== "running").map(([status, label]) => <option key={status} value={status}>{label}</option>)}
              </Select>
              <Control disabled>Reassign</Control><Control disabled>Open in Table</Control>
            </div>
          </div>
        ) : null}
      </Drawer>
    </ProjectTabFrame>
  );
}

function CardDetailSections({ card }: { card: KanbanCardDetail }) {
  const result = card.result || card.latestSummary;
  return (
    <div className="grid gap-4">
      {card.createdAt ? <Receipt className="ml-0" verb="created" object={formatCardTime(card.createdAt)} /> : null}
      {card.body ? <DrawerSection label="Task"><p className="whitespace-pre-wrap">{card.body}</p></DrawerSection> : null}
      {card.failure ? <DrawerSection label="Last failure"><p className="whitespace-pre-wrap text-[var(--bad)]">{card.failure}</p></DrawerSection> : null}
      {result ? <DrawerSection label="Result"><p className="whitespace-pre-wrap">{result}</p></DrawerSection> : null}
      {card.workspacePath || card.branchName ? (
        <DrawerSection label="Runs in"><Receipt className="ml-0" verb={card.branchName ? "branch" : "workspace"} object={[card.workspacePath, card.branchName].filter(Boolean).join(" · ")} /></DrawerSection>
      ) : null}
      {card.runs.length ? (
        <DrawerSection label={`Runs · ${card.runs.length}`}>
          {card.runs.map((run) => <Receipt key={run.id} className="ml-0" verb={run.outcome ?? run.status} object={run.summary ?? run.error ?? run.profile ?? `run ${run.id}`} />)}
        </DrawerSection>
      ) : null}
      {card.comments.length ? (
        <DrawerSection label={`Activity · ${card.comments.length}`}>
          <div className="grid gap-3">
            {card.comments.map((comment) => <article key={comment.id}><Identity name={comment.author || "Unknown"} runtime="hermes" /><p className="mt-1 whitespace-pre-wrap">{comment.body}</p>{comment.createdAt ? <Receipt className="ml-0" verb="at" object={formatCardTime(comment.createdAt)} /> : null}</article>)}
          </div>
        </DrawerSection>
      ) : null}
    </div>
  );
}

function formatCardTime(epoch: number) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(epoch * 1000));
}

function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return <section className="grid gap-1 text-[var(--t-meta)] leading-relaxed text-[var(--text)]"><span className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>{children}</section>;
}

export function ProjectTabFrame({ children }: { children: ReactNode }) {
  return <div className="relative min-h-0 flex-1 overflow-y-auto p-5">{children}</div>;
}
