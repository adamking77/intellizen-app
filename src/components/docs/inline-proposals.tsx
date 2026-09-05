import { useState } from "react";
import { Control } from "@/components/ui/control";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { documentPage } from "@/lib/document-editing";
import { useProposals } from "@/proposals/use-proposals";

export function InlineProposals({ path, raw, title, onApplied, beforeDecision, onDecisionChange, sourcePath }: {
  sourcePath?: string | null;
  beforeDecision: () => Promise<boolean>; onDecisionChange: (busy: boolean) => void;
  path: string | null; raw: string; title: string; onApplied: (raw: string) => void;
}) {
  const { proposals, accept, reject, busy, error } = useProposals(path);
  const [deciding, setDeciding] = useState(false);
  const decide = async (action: () => Promise<unknown>) => {
    setDeciding(true); onDecisionChange(true);
    try { if (await beforeDecision()) await action(); }
    finally { setDeciding(false); onDecisionChange(false); }
  };
  const [selected, setSelected] = useState<string | null>(null);
  const proposal = proposals.find((p) => p.id === selected) ?? proposals[0];
  const body = documentPage(raw, title).body;
  if (!proposal) return <>{error ? <p role="alert" className="mb-4 text-[var(--bad)]">{error}</p> : null}<MarkdownBody content={body} vaultPath={sourcePath || path} /></>;
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const bodyStart = raw.replace(/\r\n/g, "\n").indexOf(body);
  let cursor = bodyStart < 0 ? 0 : raw.slice(0, bodyStart).split("\n").length - 1;
  const pieces = proposal.hunks.map((hunk) => {
    const preceding = lines.slice(cursor, Math.max(cursor, hunk.at)).join("\n");
    cursor = Math.max(cursor, hunk.at + hunk.old.length);
    return { hunk, preceding };
  });
  return <div data-testid="inline-proposals">
    <div className="mb-6 rounded-[var(--r-ctl)] bg-[color-mix(in_srgb,var(--wait)_10%,transparent)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[var(--t-meta)] text-[var(--wait)]">{proposal.hunks.length} edits from {proposal.author}</p>
        <Control variant="primary" disabled={busy || deciding} onClick={() => void decide(async () => { const text = await accept(proposal.id, proposal.hunks, []); if (text !== null) onApplied(text); })}>Accept all</Control>
        <Control variant="quiet" disabled={busy || deciding} onClick={() => void decide(() => reject(proposal.id))}>Reject all</Control>
      </div>
      {proposal.note ? <p className="mt-1 text-[var(--t-meta)] text-[var(--text-muted)]">{proposal.note}</p> : null}
      {proposals.length > 1 ? <div className="mt-2 flex flex-wrap gap-1">{proposals.map((p) => <Control key={p.id} variant={p.id === proposal.id ? "selected" : "quiet"} onClick={() => setSelected(p.id)}>{p.author} · {p.hunks.length} edits</Control>)}</div> : null}
    </div>
    {error ? <p role="alert" className="mb-4 text-[var(--bad)]">{error}</p> : null}
    {pieces.map(({ hunk, preceding }) => <div key={hunk.id}>
      <MarkdownBody content={preceding} vaultPath={sourcePath || path} />
      <div className="my-3 text-[var(--t-body)] leading-relaxed">
        {hunk.old.length ? <del className="block bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] decoration-[var(--bad)]"><MarkdownBody content={hunk.old.join("\n")} vaultPath={sourcePath || path} /></del> : null}{" "}
        {hunk.new.length ? <ins className="block bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] decoration-[var(--ok)]"><MarkdownBody content={hunk.new.join("\n")} vaultPath={sourcePath || path} /></ins> : null}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Control disabled={busy || deciding} variant="primary" aria-label={`Accept edit ${hunk.id + 1}`} onClick={() => void decide(async () => { const text = await accept(proposal.id, [hunk], []); if (text !== null) onApplied(text); })}>Accept</Control>
        <Control disabled={busy || deciding} variant="quiet" aria-label={`Reject edit ${hunk.id + 1}`} onClick={() => void decide(() => accept(proposal.id, [], [hunk]))}>Reject</Control>
        <span className="text-[var(--t-meta)] text-[var(--text-muted)]">{proposal.author} · edit {hunk.id + 1}</span>
      </div>
    </div>)}
    <MarkdownBody content={lines.slice(cursor).join("\n")} vaultPath={sourcePath || path} />
  </div>;
}
