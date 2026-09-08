import { useRef, useState } from "react";

import { Control } from "@/components/ui/control";
import { MarkdownBody } from "@/components/ui/markdown-body";
import type { DocumentProposalDecision, DocumentProposalReview } from "@/proposals/document-review-context";

export function InlineProposals({ review, onDecision }: {
  review: DocumentProposalReview;
  onDecision: (decision: DocumentProposalDecision) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const deciding = useRef(false);
  const proposal = review.proposals.find((item) => item.id === selected) ?? review.proposals[0];
  if (!proposal) return review.error ? (
    <section aria-label={`Suggested edits for ${review.title}`} data-testid="inline-proposals" className="rounded-[var(--r-ctl)] border border-[var(--line)] bg-[var(--surface-wash)] p-3">
      <p role="alert" className="text-[length:var(--t-meta)] text-[var(--bad)]">{review.error}</p>
    </section>
  ) : null;

  const decide = async (decision: DocumentProposalDecision) => {
    if (deciding.current || review.busy) return;
    deciding.current = true;
    setLocalError(null);
    try {
      await onDecision(decision);
    } catch (error) {
      setLocalError(String(error));
    } finally {
      deciding.current = false;
    }
  };
  const decision = (
    taken = proposal.hunks,
    dropped = [] as typeof proposal.hunks,
  ): DocumentProposalDecision => ({
    documentId: review.documentId,
    docPath: review.docPath,
    proposalId: proposal.id,
    taken,
    dropped,
  });

  return <section aria-label={`Suggested edits for ${review.title}`} data-testid="inline-proposals" className="rounded-[var(--r-ctl)] border border-[var(--line)] bg-[var(--surface-wash)] p-3">
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 text-[length:var(--t-meta)] text-[var(--wait)]">{proposal.hunks.length} suggested edit{proposal.hunks.length === 1 ? "" : "s"} from {proposal.author}</p>
      <Control variant="quiet" disabled={review.busy} onClick={() => void decide(decision())}>Accept all</Control>
      <Control variant="quiet" disabled={review.busy} onClick={() => void decide(decision([], proposal.hunks))}>Reject all</Control>
    </div>
    {proposal.note ? <p className="mt-1 text-[length:var(--t-meta)] text-[var(--text-muted)]">{proposal.note}</p> : null}
    {review.proposals.length > 1 ? <div className="mt-2 flex flex-wrap gap-1">{review.proposals.map((item) => <Control key={item.id} aria-pressed={item.id === proposal.id} variant={item.id === proposal.id ? "selected" : "quiet"} onClick={() => setSelected(item.id)}>{item.author} · {item.hunks.length}</Control>)}</div> : null}
    {localError || review.error ? <p role="alert" className="mt-2 text-[length:var(--t-meta)] text-[var(--bad)]">{localError ?? review.error}</p> : null}
    <div className="mt-3 grid gap-3">
      {proposal.hunks.map((hunk) => <div key={hunk.id} className="rounded-[var(--r-ctl)] border border-[var(--line)] p-2">
        {hunk.old.length ? <del className="block bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] decoration-[var(--bad)]"><MarkdownBody content={hunk.old.join("\n")} vaultPath={review.docPath} /></del> : null}
        {hunk.new.length ? <ins className="block bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] decoration-[var(--ok)]"><MarkdownBody content={hunk.new.join("\n")} vaultPath={review.docPath} /></ins> : null}
        <div className="mt-2 flex items-center gap-2">
          <Control variant="quiet" disabled={review.busy} aria-label={`Accept edit ${hunk.id + 1}`} onClick={() => void decide(decision([hunk]))}>Accept</Control>
          <Control variant="quiet" disabled={review.busy} aria-label={`Reject edit ${hunk.id + 1}`} onClick={() => void decide(decision([], [hunk]))}>Reject</Control>
          <span className="text-[length:var(--t-meta)] text-[var(--text-muted)]">Edit {hunk.id + 1}</span>
        </div>
      </div>)}
    </div>
  </section>;
}
