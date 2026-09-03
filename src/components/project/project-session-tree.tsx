import type { HermesProjectSession } from "@/services/hermes-project-sessions";
import { projectSessionKey } from "@/lib/project-room";
import { cn } from "@/lib/utils";

export const PROJECT_TREE_SESSION_LIMIT = 8;

export function ProjectSessionTree({
  depth,
  projectId,
  selectedKey,
  sessions,
  onSelect,
}: {
  depth: number;
  projectId: string;
  selectedKey: string | null;
  sessions: HermesProjectSession[];
  onSelect: (session: HermesProjectSession) => void;
}) {
  return (
    <>
      {sessions.slice(0, PROJECT_TREE_SESSION_LIMIT).map((session) => {
        const key = projectSessionKey(session);
        return (
          <button
            key={key}
            type="button"
            role="treeitem"
            tabIndex={-1}
            data-id={`session:${key}`}
            data-parent={projectId}
            aria-selected={selectedKey === key}
            aria-label={session.title}
            title={`${session.profile} · ${session.cwd ?? "No working directory"}`}
            style={{ paddingLeft: 4 + depth * 12 }}
            className={cn(
              "nav-node h-8 select-none",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
            )}
            onClick={() => onSelect(session)}
          >
            <span className="h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-left">{session.title}</span>
            <span className="shrink-0 font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{session.profile}</span>
          </button>
        );
      })}
      {sessions.length > PROJECT_TREE_SESSION_LIMIT ? (
        <p className="truncate py-1 pr-2 text-meta" style={{ paddingLeft: 4 + depth * 12 + 20 }}>
          {sessions.length - PROJECT_TREE_SESSION_LIMIT} older conversations
        </p>
      ) : null}
    </>
  );
}
