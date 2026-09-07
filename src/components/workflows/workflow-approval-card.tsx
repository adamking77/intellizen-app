import { useState } from "react";
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
    <p className="mt-3 font-ui text-[var(--t-body)] leading-relaxed text-[var(--text-muted)]">{question.detail}</p>
    <dl className="mt-5 grid gap-1 font-mono text-[var(--t-count)] leading-relaxed text-[var(--text-dim)] sm:grid-cols-[90px_minmax(0,1fr)]"><dt>Run</dt><dd>{question.runId}</dd><dt>Step</dt><dd>{question.currentStepId ?? "No current step ID recorded"}{question.currentStep ? ` · ${question.currentStep}` : ""}</dd><dt>Approval</dt><dd>{question.approvalId ?? "Legacy approval"}{question.runVersion === null ? ` · updated ${question.updatedAt}` : ` · version ${question.runVersion}`}</dd><dt>Meanwhile</dt><dd>{meanwhile}</dd><dt>If you leave it</dt><dd>The workflow stays at this approval step.</dd></dl>
    {question.hasPayloadSnapshot ? <details className="mt-4 max-w-[760px] border-t border-[var(--surface-line)] pt-3 font-ui text-[var(--t-meta)] text-[var(--text-muted)]"><summary className="cursor-pointer">Approval payload{question.payloadHash ? ` · ${question.payloadHash}` : ""}</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[var(--t-count)] text-[var(--text)]">{payloadText(question.payloadSnapshot)}</pre></details> : <p className="mt-4 font-ui text-[var(--t-meta)] text-[var(--text-muted)]">No durable payload snapshot was recorded for this legacy approval.</p>}
    <label className="mt-5 block max-w-[620px] font-mono text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-dim)]">Reason for changes or rejection<input aria-label="Workflow approval reason" disabled={busy} value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-2 block w-full rounded-[var(--r-ctl)] border border-[var(--surface-line)] bg-[var(--surface)] px-3 py-2 font-ui text-[var(--t-meta)] normal-case tracking-normal text-[var(--text)]" /></label>
    <Choices className="mt-4" label="Workflow approval choices" choices={[{ id: "approved", label: question.hasPayloadSnapshot ? "Approve exact payload" : "Approve recorded approval", disabled: busy }, { id: "changes_requested", label: "Request changes", disabled: busy || !summary.trim() }, { id: "rejected", label: "Reject", quiet: true, disabled: busy || !summary.trim() }]} onChoose={(id) => submit(id as "approved" | "rejected" | "changes_requested")} />
    {error ? <p role="alert" className="mt-3 text-[var(--t-meta)] text-[var(--bad)]">{error}</p> : null}
  </div>;
}
