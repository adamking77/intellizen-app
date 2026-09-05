import { useRef, useState } from "react";
import { AppDialog } from "@/components/ui/app-dialog";
import { Control } from "@/components/ui/control";
import type { WorkflowDraftProposal } from "@/lib/workflow-composer";
import { validateWorkflowDefinition, type WorkflowDefinitionV1 } from "@/lib/workflow-schema";
import { WorkflowChangeReview } from "./workflow-change-review";

export function WorkflowProposalPreview({ proposal, definition, draftRevision, onApply, onDismiss }: { proposal: WorkflowDraftProposal; definition: WorkflowDefinitionV1; draftRevision?: string | null; onApply: () => void; onDismiss?: () => void }) {
  const [open, setOpen] = useState(false);
  const base = useRef({ id: proposal.id, content: JSON.stringify(definition) });
  if (base.current.id !== proposal.id) base.current = { id: proposal.id, content: JSON.stringify(definition) };
  const checking = !draftRevision;
  const stale = base.current.content !== JSON.stringify(definition) || Boolean(draftRevision && draftRevision !== proposal.baseRevision);
  const valid = validateWorkflowDefinition(proposal.definition).valid && proposal.definition.id === definition.id;
  return <>
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--mantle)] px-3 py-2 text-[var(--t-meta)]"><p className="min-w-0 flex-1">{stale ? "Agent proposal is based on an earlier draft." : "An agent proposed changes."}</p><Control size="sm" onClick={() => setOpen(true)}>Review proposal</Control>{onDismiss ? <Control size="sm" variant="quiet" onClick={onDismiss}>Dismiss</Control> : null}</div>
    <AppDialog initialFocus="title" open={open} onOpenChange={setOpen} title="Review workflow changes" description="Review each changed field. Applying updates your local draft; Save remains with you." footer={<><Control onClick={() => setOpen(false)}>Close</Control><Control variant="primary" disabled={checking || stale || !valid} onClick={() => { onApply(); setOpen(false); }}>Apply to draft</Control></>}>
      {proposal.summary ? <p className="mb-3 text-[var(--t-meta)]">{proposal.summary}</p> : null}
      {checking ? <p role="status" className="mb-3 text-[var(--text-muted)]">Checking the current draft revision…</p> : null}
      {stale ? <p role="alert" className="mb-3 text-[var(--warning)]">Your draft changed after this proposal’s starting point. Ask the agent for an updated proposal; these changes cannot overwrite your work.</p> : null}
      {!valid ? <p role="alert" className="mb-3 text-[var(--danger)]">This proposal does not match a valid definition for this workflow.</p> : null}
      <WorkflowChangeReview before={definition} after={proposal.definition} />
    </AppDialog>
  </>;
}
