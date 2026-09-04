import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import { Control } from "@/components/ui/control";
import { Drawer } from "@/components/ui/drawer";
import { Identity } from "@/components/ui/identity";
import { QueryState } from "@/components/ui/query-state";
import { Receipt, ToolRow } from "@/components/ui/receipt";
import { Pill } from "@/components/ui/status-pill";
import { projectSessionKey } from "@/lib/project-room";
import { listWorkEvents, workEventsForSession } from "@/lib/data/work-receipts";
import { cn } from "@/lib/utils";
import { runViewTransition } from "@/lib/view-transitions";
import { getHermesSessionMessages, listHermesProjectSessions } from "@/services/hermes-project-sessions";

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
}: {
  folders: string[];
  projectId: string;
  selectedSessionKey?: string | null;
  transcriptOnly?: boolean;
}) {
  const projectSessions = useQuery({
    queryKey: ["hermes-project-sessions", projectId, folders],
    queryFn: () => listHermesProjectSessions(folders),
  });
  const sessions = projectSessions.data ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const selected = sessions.find((session) => projectSessionKey(session) === selectedKey) ?? null;
  const drawerSession = sessions.find((session) => projectSessionKey(session) === drawerKey) ?? null;

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
  const events = useQuery({
    queryKey: ["work-events", "session", selected?.profile, selected?.id],
    queryFn: () => listWorkEvents({ limit: 500 }),
    enabled: selected != null && transcriptOnly,
  });
  const receipts = selected ? workEventsForSession(events.data ?? [], selected.id, selected.profile) : [];

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <QueryState
        className="m-5 w-full"
        isLoading={projectSessions.isLoading}
        error={projectSessions.error}
        isEmpty={sessions.length === 0}
        loadingLabel="Loading project sessions"
        errorTitle="Session history unavailable"
        emptyTitle="No sessions filed here"
        emptyDescription={folders.length === 0
          ? "Add a project folder so Hermes sessions can file here by working directory."
          : "Hermes sessions appear here when their working directory is inside this project."}
        onRetry={() => void projectSessions.refetch()}
      >
        {!transcriptOnly ? <aside className="w-64 shrink-0 overflow-y-auto border-r border-[var(--border)] p-3">
          {sessions.map((session) => (
            <button
              key={`${session.profile}:${session.id}`}
              type="button"
              onClick={(event) => runViewTransition("drawer", () => setDrawerKey(projectSessionKey(session)), event.currentTarget)}
              className={cn(
                "mb-1 min-h-[var(--h-row)] w-full rounded-[var(--r-ctl)] px-2 py-1.5 text-left hover:bg-[var(--hover)]",
                selected?.id === session.id && selected.profile === session.profile && "bg-[var(--selected)]",
              )}
            >
              <div className="grid min-w-0 gap-1">
                  <p className="truncate font-ui text-[var(--t-meta)] font-medium text-[var(--text)]">{session.title}</p>
                  <div className="flex items-center gap-2"><Identity name={session.profile} runtime="hermes" /><Pill>{session.messageCount} messages</Pill><span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">{formatTime(session.lastActive)}</span></div>
              </div>
            </button>
          ))}
        </aside> : null}
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {transcriptOnly && selected ? (
            <header className="mx-auto mb-4 flex max-w-3xl items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
              <div className="min-w-0">
                <div className="text-label">Read-only session</div>
                <h2 className="mt-1 truncate text-[var(--t-title)] text-[var(--text)]">{selected.title}</h2>
                <div className="mt-2"><Identity name={selected.profile} runtime="hermes" /></div>
              </div>
              <div className="shrink-0 text-right font-mono text-[var(--t-count)] text-[var(--text-muted)]">
                <div>{selected.messageCount} messages · {selected.toolCallCount} tools</div>
                <div className="mt-1">{formatTime(selected.lastActive)}</div>
              </div>
            </header>
          ) : null}
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
                <article key={message.id} className={cn("py-4", message.role === "user" && "rounded-[var(--r-ctl)] bg-[var(--raised)] px-4")}>
                  {message.role === "tool" ? <ToolRow tool={message.name ?? "tool"} detail={message.text} state="verified" /> : message.role === "system" ? <Receipt verb="recorded" object={message.text} /> : (
                    <><div className="mb-2"><Identity name={message.role === "assistant" ? selected?.profile ?? "Agent" : "you"} runtime={message.role === "assistant" ? "hermes" : undefined} kind={message.role === "user" ? "you" : "hermes"} /></div><ReplyMarkdown content={message.text} /></>
                  )}
                </article>
              ))}
              {receipts.length ? (
                <section aria-label="Session receipts" className="grid gap-2 py-4">
                  <div className="text-label">Receipts</div>
                  {receipts.map((event) => <Receipt key={event.id} verb={event.event_kind.replaceAll("_", " ")} object={event.summary ?? event.actor} />)}
                </section>
              ) : null}
            </div>
          </QueryState>
        </div>
      </QueryState>
      <Drawer open={drawerSession != null} onClose={() => setDrawerKey(null)} label={drawerSession?.title ?? "Session details"}>
        {drawerSession ? <div className="grid gap-5 p-4"><div><div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">Session</div><h2 className="mt-1 text-[var(--t-title)] text-[var(--text)]">{drawerSession.title}</h2></div><Identity name={drawerSession.profile} runtime="hermes" /><Receipt className="ml-0" verb="linked" object={`${drawerSession.messageCount} messages · ${formatTime(drawerSession.lastActive)}`} /><Control variant="primary" onClick={() => { setSelectedKey(projectSessionKey(drawerSession)); setDrawerKey(null); }}>Open session</Control></div> : null}
      </Drawer>
    </div>
  );
}
