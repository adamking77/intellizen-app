import { useState } from "react";

import { cn } from "@/lib/utils";

import { hunkStat, proposalStat, type Hunk, type Proposal } from "./types";
import { useProposals } from "./use-proposals";

const PILL =
  "rounded-[var(--r-pill)] px-3 py-1 font-ui text-[var(--t-meta)] leading-normal transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]";
const PILL_PLAIN = "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:opacity-90";
const PILL_PRIMARY = "bg-[var(--accent)] text-[var(--crust)] hover:opacity-90";

/** Every proposal waiting on the open document, above the editor.
 *
 *  `onApplied` receives the document text after an accept so the editor and
 *  the Supabase mirror follow the file; the strip never touches either. */
export function ProposalStrip({
  docPath,
  onApplied,
}: {
  docPath: string | null;
  onApplied: (text: string) => void;
}) {
  const { proposals, accept, reject, busy, error } = useProposals(docPath);
  if (proposals.length === 0) return null;
  return (
    <div data-testid="proposal-strip" className="flex flex-col">
      {proposals.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          busy={busy}
          error={error}
          onAccept={async (taken, dropped) => {
            const text = await accept(p.id, taken, dropped);
            if (text !== null) onApplied(text);
          }}
          onReject={() => void reject(p.id)}
        />
      ))}
    </div>
  );
}

/** The donor's work-product card: a summary line carrying the counts, its
 *  actions on that line, and the diff beneath it. Every hunk starts accepted;
 *  unticking the one that is wrong is less work than ticking the four that are
 *  right. Colour is never the only signal: every line carries a sign. */
export function ProposalCard({
  proposal,
  onAccept,
  onReject,
  busy,
  error,
}: {
  proposal: Proposal;
  onAccept: (taken: Hunk[], dropped: Hunk[]) => void;
  onReject: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(true);

  const taking = proposal.hunks.filter((h) => !rejected.has(h.id));
  const dropping = proposal.hunks.filter((h) => rejected.has(h.id));
  const stat = proposalStat(taking);

  const toggle = (id: number) =>
    setRejected((all) => {
      const next = new Set(all);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div data-proposal={proposal.id} className="mb-3 rounded-[var(--r-plane)] bg-[var(--mantle)] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-ui text-[var(--t-ui)] text-[var(--text)]">{proposal.author}</span>
        <span className="font-ui text-[var(--t-section)] text-[var(--subtext-0)]">proposes</span>
        <Counts stat={stat} />
        <div className="flex-1" />
        <button
          type="button"
          className={cn(PILL, PILL_PLAIN)}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={open ? "Hide the changes" : "Review the changes"}
        >
          {open ? "Hide" : "Review"}
        </button>
        <button type="button" className={cn(PILL, PILL_PLAIN)} onClick={onReject} disabled={busy} title="Discard this entirely">
          Discard
        </button>
        <button
          type="button"
          className={cn(PILL, PILL_PRIMARY)}
          onClick={() => onAccept(taking, dropping)}
          disabled={busy}
          title={
            taking.length === proposal.hunks.length
              ? "Write every change"
              : `Write ${taking.length} of ${proposal.hunks.length} changes`
          }
        >
          {taking.length === 0
            ? "Accept none"
            : taking.length === proposal.hunks.length
              ? "Accept"
              : `Accept ${taking.length}`}
        </button>
      </div>

      {proposal.note ? <div className="mt-1.5 font-ui text-[var(--t-section)] text-[var(--subtext-0)]">{proposal.note}</div> : null}

      {error ? (
        <div
          role="status"
          className="mt-2 rounded-[var(--r-row)] border border-[color-mix(in_srgb,var(--bad)_40%,transparent)] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-2.5 py-1.5 font-ui text-[var(--t-meta)] text-[var(--text)]"
        >
          {error}
        </div>
      ) : null}

      {open ? (
        <div className="mt-2 flex flex-col gap-[7px]">
          {proposal.hunks.map((h) => {
            const off = rejected.has(h.id);
            return (
              <div key={h.id} data-rejected={off || undefined} className={cn("overflow-hidden rounded-[var(--r-row)] bg-[var(--crust)]", off && "opacity-55")}>
                <label className="flex items-center gap-2 px-2 py-1.5">
                  <input type="checkbox" checked={!off} onChange={() => toggle(h.id)} disabled={busy} className="accent-[var(--accent)]" />
                  <span className="font-ui text-[var(--t-count)] uppercase tracking-wide text-[var(--subtext-0)]">line {h.at + 1}</span>
                  <Counts stat={hunkStat(h)} />
                  <div className="flex-1" />
                  {off ? <span className="font-ui text-[var(--t-section)] text-[var(--subtext-0)]">not taken</span> : null}
                </label>
                <div className="overflow-x-auto pb-1 font-mono text-[var(--t-section)] leading-[1.55]">
                  {h.old.map((line, i) => (
                    <Line key={`o${i}`} sign="−" tone="bad" text={line} />
                  ))}
                  {h.new.map((line, i) => (
                    <Line key={`n${i}`} sign="+" tone="ok" text={line} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Counts({ stat }: { stat: { added: number; removed: number } }) {
  return (
    <span className="font-mono text-[var(--t-section)] tabular-nums">
      <span className="text-[var(--ok)]">+{stat.added}</span> <span className="text-[var(--bad)]">−{stat.removed}</span>
    </span>
  );
}

function Line({ sign, tone, text }: { sign: string; tone: "ok" | "bad"; text: string }) {
  return (
    <div
      className={cn(
        "flex gap-2 whitespace-pre px-2",
        tone === "ok"
          ? "bg-[color-mix(in_srgb,var(--ok)_11%,transparent)]"
          : "bg-[color-mix(in_srgb,var(--bad)_11%,transparent)]",
      )}
    >
      <span aria-hidden className="w-2 shrink-0 text-center opacity-75">
        {sign}
      </span>
      <span className="min-w-0">{text || " "}</span>
    </div>
  );
}
