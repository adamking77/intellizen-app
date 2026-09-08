import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Choices } from "@/components/ui/choices";

export type WorkflowApprovalQuestion = {
  runId: string;
  approvalId: string | null;
  runVersion: number | null;
  currentStepId: string | null;
  currentStep: string | null;
  updatedAt: string;
  payloadHash: string | null;
  payloadSnapshot: unknown;
  hasPayloadSnapshot: boolean;
  owner: string;
  title: string;
  detail: string;
};

function payloadText(payload: unknown) {
  try { return JSON.stringify(payload, null, 2) ?? "null"; }
  catch { return "The recorded payload snapshot could not be rendered."; }
}

export function WorkflowApprovalCard({ question, meanwhile, busy, error, onAnswer, compact = false }: {
  question: WorkflowApprovalQuestion;
  meanwhile: string;
  busy: boolean;
  error: string | null;
  onAnswer: (decision: "approved" | "rejected" | "changes_requested", summary: string) => void;
  compact?: boolean;
}) {
  const identity = `${question.runId}:${question.approvalId ?? question.currentStepId ?? question.updatedAt}`;
  return <WorkflowApprovalForm key={identity} question={question} meanwhile={meanwhile} busy={busy} error={error} onAnswer={onAnswer} compact={compact} />;
}

function WorkflowApprovalForm({ question, meanwhile, busy, error, onAnswer, compact }: {
  question: WorkflowApprovalQuestion;
  meanwhile: string;
  busy: boolean;
  error: string | null;
  onAnswer: (decision: "approved" | "rejected" | "changes_requested", summary: string) => void;
  compact: boolean;
}) {
  const [summary, setSummary] = useState("");
  const submit = (decision: "approved" | "rejected" | "changes_requested") => {
    const knownSummary = decision === "approved" ? question.hasPayloadSnapshot ? "Approved exact workflow payload." : "Approved the recorded workflow request." : summary.trim();
    if (knownSummary) onAnswer(decision, knownSummary);
  };
  return <div className={compact ? "max-w-[760px] border-t border-[var(--surface-line)] pt-6" : ""}>
    <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--question)]">Workflow approval · {question.owner}</p>
    <h2 className="mt-3 font-ui text-[clamp(20px,2.5vw,24px)] font-light leading-[1.3] text-[var(--text)]">{question.title}</h2>
    <p className="mt-3 font-ui text-[length:var(--t-body)] leading-relaxed text-[var(--text-muted)]">{question.detail}</p>
    <dl className="mt-5 grid gap-1 font-ui text-[length:var(--t-meta)] leading-relaxed text-[var(--text-muted)] sm:grid-cols-[100px_minmax(0,1fr)]"><dt>Current step</dt><dd>{question.currentStep ?? "Approval requested"}</dd><dt>Meanwhile</dt><dd>{meanwhile}</dd><dt>If you leave it</dt><dd>Work that needs this answer waits. Other work continues.</dd></dl>
    <details className="mt-3 text-[length:var(--t-count)] text-[var(--text-dim)]"><summary className="cursor-pointer">Technical details</summary><dl className="mt-2 grid gap-1 break-words font-mono sm:grid-cols-[90px_minmax(0,1fr)]"><dt>Run</dt><dd>{question.runId}</dd><dt>Step ID</dt><dd>{question.currentStepId ?? "Not recorded"}</dd><dt>Approval ID</dt><dd>{question.approvalId ?? "Not recorded"}</dd><dt>Version</dt><dd>{question.runVersion ?? question.updatedAt}</dd><dt>Payload hash</dt><dd>{question.payloadHash ?? "Not recorded"}</dd></dl></details>
    {question.hasPayloadSnapshot ? <details className="mt-4 max-w-[760px] border-t border-[var(--surface-line)] pt-3 font-ui text-[length:var(--t-meta)] text-[var(--text-muted)]"><summary className="cursor-pointer">Review what will run</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[length:var(--t-count)] text-[var(--text)]">{payloadText(question.payloadSnapshot)}</pre></details> : <p className="mt-4 font-ui text-[length:var(--t-meta)] text-[var(--text-muted)]">This older request has no saved preview. Review the workflow before approving it.</p>}
    <label className="mt-5 block max-w-[620px] font-mono text-[length:var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-dim)]">Reason for changes or rejection<Input aria-label="Workflow approval reason" disabled={busy} value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-2 normal-case tracking-normal" /></label>
    <p className="mt-2 text-[length:var(--t-meta)] text-[var(--text-muted)]">Add a reason to request changes or reject.</p>
    <Choices className="mt-4" label="Workflow approval choices" choices={[{ id: "approved", label: question.hasPayloadSnapshot ? "Approve this version" : "Approve this request", disabled: busy }, { id: "changes_requested", label: "Request changes", disabled: busy || !summary.trim() }, { id: "rejected", label: "Reject", quiet: true, disabled: busy || !summary.trim() }]} onChoose={(id) => submit(id as "approved" | "rejected" | "changes_requested")} />
    {error ? <p role="alert" className="mt-3 text-[length:var(--t-meta)] text-[var(--bad)]">{error}</p> : null}
  </div>;
}
