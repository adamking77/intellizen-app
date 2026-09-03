import { useQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";

import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import { QueryState } from "@/components/ui/query-state";
import type { Hierarchy } from "@/lib/hierarchy";
import { groupSessionsByProject, projectSessionKey } from "@/lib/project-room";
import { cn } from "@/lib/utils";
import { getHermesSessionMessages, listHermesSessions } from "@/services/hermes-project-sessions";

function formatTime(epoch: number) {
  if (!epoch) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(epoch * 1000));
}

export function ProjectSessions({
  folders,
  projectId,
  selectedSessionKey,
  transcriptOnly = false,
  tree,
}: {
  folders: string[];
  projectId: string;
  selectedSessionKey?: string | null;
  transcriptOnly?: boolean;
  tree: Hierarchy;
}) {
  const allSessions = useQuery({
    queryKey: ["hermes-sessions", "project-room"],
    queryFn: listHermesSessions,
  });
  const sessions = groupSessionsByProject(tree, allSessions.data ?? []).get(projectId) ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = sessions.find((session) => projectSessionKey(session) === selectedKey) ?? null;

  useEffect(() => {
    const requested = sessions.find((session) => projectSessionKey(session) === selectedSessionKey);
    const next = requested ?? sessions[0];
    if (next && projectSessionKey(next) !== selectedKey) {
      setSelectedKey(projectSessionKey(next));
    }
  }, [selectedKey, selectedSessionKey, sessions]);

  const transcript = useQuery({
    queryKey: ["hermes-session-messages", selected?.profile, selected?.id],
    queryFn: () => getHermesSessionMessages(selected!.id, selected!.profile),
    enabled: selected != null,
  });

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <QueryState
        className="m-5 w-full"
        isLoading={allSessions.isLoading}
        error={allSessions.error}
        isEmpty={sessions.length === 0}
        loadingLabel="Loading project sessions"
        errorTitle="Session history unavailable"
        emptyTitle="No sessions filed here"
        emptyDescription={folders.length === 0
          ? "Add a project folder so Hermes sessions can file here by working directory."
          : "Hermes sessions appear here when their working directory is inside this project."}
        onRetry={() => void allSessions.refetch()}
      >
        {!transcriptOnly ? <aside className="w-64 shrink-0 overflow-y-auto border-r border-[var(--border)] p-3">
          {sessions.map((session) => (
            <button
              key={`${session.profile}:${session.id}`}
              type="button"
              onClick={() => setSelectedKey(projectSessionKey(session))}
              className={cn(
                "mb-1 w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover)]",
                selected?.id === session.id && selected.profile === session.profile && "bg-[var(--selected)]",
              )}
            >
              <div className="flex items-start gap-2">
                <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
                <div className="min-w-0">
                  <p className="truncate font-ui text-[12px] font-medium text-[var(--text)]">{session.title}</p>
                  {session.preview ? <p className="mt-0.5 line-clamp-2 text-meta">{session.preview}</p> : null}
                  <p className="mt-1 font-mono text-[9px] text-[var(--overlay-1)]">
                    {session.profile} · {session.messageCount} messages · {formatTime(session.lastActive)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </aside> : null}
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <QueryState
            isLoading={transcript.isLoading}
            error={transcript.error}
            isEmpty={(transcript.data?.length ?? 0) === 0}
            loadingLabel="Loading transcript"
            errorTitle="Transcript unavailable"
            emptyTitle="No transcript"
            emptyDescription="This session has no readable messages."
            onRetry={() => void transcript.refetch()}
          >
            <div className="mx-auto max-w-3xl divide-y divide-[var(--border-subtle)]">
              {(transcript.data ?? []).map((message) => (
                <article key={message.id} className={cn("py-4", message.role === "user" && "bg-[var(--surface-wash)] px-4")}>
                  <p className="mb-2 text-label">{message.role === "assistant" ? selected?.profile : message.name ?? message.role}</p>
                  {message.role === "tool" || message.role === "system" ? (
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-[var(--subtext-0)]">{message.text}</pre>
                  ) : (
                    <ReplyMarkdown content={message.text} />
                  )}
                </article>
              ))}
            </div>
          </QueryState>
        </div>
      </QueryState>
    </div>
  );
}
