import { useState } from "react";
import { Control } from "@/components/ui/control";
import type { WorkEventItem } from "@/lib/data/work-receipts";
import { workflowRunReceiptOrder, workflowRunTimeline } from "./workflow-run-timeline";

export function WorkflowRunPulse({ events, pendingQuestion }: { events: WorkEventItem[]; pendingQuestion: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ordered = workflowRunReceiptOrder(events);
  const selectedIndex = selectedId === null ? -1 : ordered.findIndex((event) => event.id === selectedId);
  const index = selectedIndex < 0 ? ordered.length - 1 : selectedIndex;
  const visible = ordered.slice(0, index + 1);
  const traces = workflowRunTimeline(visible);
  const current = ordered[index];
  const positions = new Map(ordered.map((event, position) => [event.id, 12 + position * 576 / Math.max(1, ordered.length - 1)]));
  const end = current ? positions.get(current.id)! : 12;
  const questions = visible.filter((event) => event.event_kind === "approval_requested" || event.event_kind === "approval_request");
  const atLatest = index === ordered.length - 1;

  if (!current) return <p className="mt-2 text-[length:var(--t-meta)] text-[var(--text-muted)]">No durable run receipts were recorded.</p>;
  return <div className="mt-2 space-y-3">
    <p className="text-[length:var(--t-count)] text-[var(--text-muted)]">Receipt order · {index + 1} of {ordered.length}{events.length >= 500 ? " · Latest 500 receipts; earlier history is outside this view." : ""}</p>
    <div className="space-y-2" aria-label="Agent receipt traces">
      {traces.map((trace) => <div key={trace.agent}>
        <p className="break-words text-[length:var(--t-meta)] text-[var(--text)]">{trace.agent}</p>
        <svg viewBox="0 0 600 32" role="img" aria-label={`${trace.agent}: ${trace.events.length} recorded events`} className="h-8 w-full">
          <path d={`M12 20 H${end}`} stroke="var(--border)" fill="none" />
          <path d={`M12 20 ${trace.events.map((event) => { const x = positions.get(event.id)!; return `L${Math.max(12, x - 3)} 20 L${x} 9 L${Math.min(end, x + 3)} 20`; }).join(" ")} H${end}`} stroke="var(--accent-text)" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
          {trace.events.map((event) => <circle key={event.id} cx={positions.get(event.id)} cy="9" r="2" fill="var(--accent-text)"><title>{event.summary || event.event_kind}</title></circle>)}
        </svg>
      </div>)}
      {!traces.length ? <p className="text-[length:var(--t-meta)] text-[var(--text-muted)]">No agent assignment receipts in this part of the run.</p> : null}
      {questions.length || (atLatest && pendingQuestion) ? <svg viewBox="0 0 600 18" role="img" aria-label="Questions in this part of the run" className="h-[18px] w-full">
        {questions.map((event) => <circle key={event.id} cx={positions.get(event.id)} cy="9" r="3" fill="var(--question)"><title>{event.summary || "Approval question"}</title></circle>)}
        {atLatest && pendingQuestion ? <circle cx={end} cy="9" r="5" fill="none" stroke="var(--question)" strokeWidth="1.5"><title>A question is open at the current step</title></circle> : null}
      </svg> : null}
    </div>
    {ordered.length > 1 ? <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-[length:var(--t-count)] text-[var(--text-muted)]">Replay receipt
        <input aria-label="Replay receipt" type="range" min="0" max={ordered.length - 1} value={index} onChange={(event) => setSelectedId(ordered[Number(event.target.value)].id)} className="min-w-0 flex-1 accent-[var(--accent)]" />
      </label>
      {selectedId !== null ? <Control size="sm" variant="quiet" onClick={() => setSelectedId(null)}>Latest</Control> : null}
    </div> : null}
    <p className="break-words text-[length:var(--t-meta)] text-[var(--text-muted)]">{current.run_version != null ? `v${current.run_version} · ` : ""}{current.summary || current.event_kind}</p>
    <details><summary className="text-[length:var(--t-meta)]">Receipts through this point</summary>
      <ol className="mt-2 max-h-48 space-y-2 overflow-y-auto text-[length:var(--t-meta)] text-[var(--text-muted)]">{visible.map((event) => <li key={event.id} className="break-words">{event.run_version != null ? `v${event.run_version} · ` : ""}{event.summary || event.event_kind}</li>)}</ol>
    </details>
  </div>;
}
