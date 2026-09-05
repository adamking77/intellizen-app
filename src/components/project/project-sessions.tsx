import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import { Control } from "@/components/ui/control";
import { Drawer } from "@/components/ui/drawer";
import { Identity } from "@/components/ui/identity";
import { QueryState } from "@/components/ui/query-state";
import { Receipt, ToolRow } from "@/components/ui/receipt";
import { Pill } from "@/components/ui/status-pill";
import { projectSessionKey } from "@/lib/project-room";
import { getWorkspaceRecord } from "@/lib/data";
import { listWorkEvents, workEventsForSession, type WorkEventItem } from "@/lib/data/work-receipts";
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
  const selectionScope = `${projectId}\0${selectedSessionKey ?? ""}`;
  const [selection, setSelection] = useState<{ scope: string; key: string | null } | null>(null);
  const selectedKey = selection?.scope === selectionScope ? selection.key : selectedSessionKey ?? null;
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const selected = selectedKey ? sessions.find((session) => projectSessionKey(session) === selectedKey) ?? null : sessions[0] ?? null;
  const drawerSession = sessions.find((session) => projectSessionKey(session) === drawerKey) ?? null;

  useEffect(() => {
    setSelection((current) => {
      const scoped = current?.scope === selectionScope ? current : { scope: selectionScope, key: selectedSessionKey ?? null };
      return scoped.key || !sessions[0] ? scoped : { ...scoped, key: projectSessionKey(sessions[0]) };
    });
  }, [selectionScope, selectedSessionKey, sessions]);

  useEffect(() => { setDrawerKey(null); }, [selectionScope]);
  const closeDrawer = useCallback(() => setDrawerKey(null), []);

  const transcript = useQuery({
    queryKey: ["hermes-session-messages", selected?.profile, selected?.id],
    queryFn: () => getHermesSessionMessages(selected!.id, selected!.profile),
    enabled: selected != null,
  });
  const events = useQuery({
    queryKey: ["work-events", "session", selected?.profile, selected?.id],
    queryFn: () => listWorkEvents({ sessionId: selected!.id, sessionProfile: selected!.profile, limit: 500 }),
    enabled: selected != null && transcriptOnly,
  });
  const receipts = selected ? workEventsForSession(events.data ?? [], selected.id, selected.profile) : [];

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <QueryState
        className="m-5 w-full"
        isLoading={projectSessions.isLoading}
        error={projectSessions.error}
        isEmpty={sessions.length === 0 && !selectedKey}
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
            error={selected ? transcript.error : new Error("Hermes did not return the selected session for this project. Refresh the session list or choose another session.")}
            isEmpty={(transcript.data?.length ?? 0) === 0}
            loadingLabel="Loading transcript"
            errorTitle={selected ? "Hermes transcript unavailable" : "Selected session unavailable"}
            emptyTitle="No transcript"
            emptyDescription="This session has no readable messages."
            onRetry={() => { if (selected) void transcript.refetch(); else void projectSessions.refetch(); }}
          >
            <div className="mx-auto max-w-3xl divide-y divide-[var(--border-subtle)]">
              {(transcript.data ?? []).map((message) => (
                <article key={message.id} className={cn("py-4", message.role === "user" && "rounded-[var(--r-ctl)] bg-[var(--raised)] px-4")}>
                  {message.role === "tool" ? <details><summary className="cursor-pointer"><ToolRow tool={message.name ?? "tool"} detail={message.text} state="recorded" /></summary><pre className="mt-2 whitespace-pre-wrap break-words text-[var(--t-meta)] text-[var(--text-muted)]">{message.text}</pre></details> : message.role === "system" ? <Receipt verb="recorded" object={message.text} /> : (
                    <><div className="mb-2"><Identity name={message.role === "assistant" ? selected?.profile ?? "Agent" : "you"} runtime={message.role === "assistant" ? "hermes" : undefined} kind={message.role === "user" ? "you" : "hermes"} /></div><ReplyMarkdown content={message.text} /></>
                  )}
                </article>
              ))}

            </div>
          </QueryState>
              {transcriptOnly && selected ? <section aria-label="Session receipts" className="mx-auto grid max-w-3xl gap-2 py-4">
                <div className="text-label">Receipts</div>
                {events.isLoading ? <p role="status" className="text-[var(--t-meta)] text-[var(--text-muted)]">Loading session receipts…</p> : null}
                {events.error ? <div role="alert" className="text-[var(--t-meta)] text-[var(--danger)]">Session receipts could not be refreshed. <Control size="sm" variant="quiet" onClick={() => void events.refetch()}>Retry receipts</Control></div> : null}
                {receipts.map((event) => <SessionReceipt key={event.id} event={event} />)}
                {!events.isLoading && !events.error && !receipts.length ? <p className="text-[var(--t-meta)] text-[var(--text-muted)]">No receipts are linked to this session.</p> : null}
                {(events.data?.length ?? 0) >= 500 ? <p className="text-[var(--t-count)] text-[var(--text-muted)]">Showing the latest 500 linked receipts.</p> : null}
              </section> : null}
        </div>
      </QueryState>
      <Drawer open={drawerSession != null} onClose={closeDrawer} label={drawerSession?.title ?? "Session details"}>
        {drawerSession ? <div className="grid gap-5 p-4"><div><div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--text-muted)]">Session</div><h2 className="mt-1 text-[var(--t-title)] text-[var(--text)]">{drawerSession.title}</h2></div><Identity name={drawerSession.profile} runtime="hermes" /><Receipt className="ml-0" verb="linked" object={`${drawerSession.messageCount} messages · ${formatTime(drawerSession.lastActive)}`} /><Control variant="primary" onClick={() => { setSelection({ scope: selectionScope, key: projectSessionKey(drawerSession) }); setDrawerKey(null); }}>Open session</Control></div> : null}
      </Drawer>
    </div>
  );
}


function SessionReceipt({ event }: { event: WorkEventItem }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState(false);
  async function openRecord() {
    if (!event.record_id || opening) return;
    setOpening(true); setFailure(false);
    try {
      const record = await getWorkspaceRecord(event.record_id);
      navigate(`/databases/${encodeURIComponent(record.database_id)}?record=${encodeURIComponent(record.id)}`);
    } catch { setFailure(true); }
    finally { setOpening(false); }
  }
  return <div className="min-w-0">
    <Receipt verb={event.event_kind.replaceAll("_", " ")} object={event.summary ?? event.actor} />
    <div className="ml-3.5 flex flex-wrap items-center gap-3 text-[var(--t-count)]">
      {event.workflow_run_id ? <Link className="text-[var(--accent-text)] hover:underline" to={`/workflows?run=${encodeURIComponent(event.workflow_run_id)}`}>Open run</Link> : null}
      {event.record_id ? <Control size="sm" variant="quiet" loading={opening} onClick={() => void openRecord()}>Open record</Control> : null}
      {failure ? <span role="alert" className="text-[var(--danger)]">Record unavailable. Try opening it again.</span> : null}
    </div>
  </div>;
}
