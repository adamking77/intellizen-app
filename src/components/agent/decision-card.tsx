import { useState } from "react";

import type { ApprovalChoice } from "@/engine/contract";
import { approvalChoiceLabel } from "@/engine/decisions";
import type { ApprovalDecision, ClarifyDecision, Decision } from "@/engine/transcript";
import { cn } from "@/lib/utils";

const PILL =
  "rounded-full px-3 py-1 font-ui text-[12px] leading-normal transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]";
const PILL_GO = "bg-[color-mix(in_srgb,var(--wait)_18%,transparent)] text-[var(--wait)] hover:opacity-90";
const PILL_PLAIN = "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:opacity-90";

/** The donor's approval gate (design.html "06 · Approval gate"): who asks,
 *  one line of what, the exact payload in mono, the real choices as buttons
 *  in the order Hermes sent them, nothing else. */
export function DecisionCard({
  decision,
  asker,
  busy,
  onApprove,
  onClarify,
}: {
  decision: Decision;
  asker: string;
  busy: boolean;
  onApprove: (decision: ApprovalDecision, choice: ApprovalChoice) => void;
  onClarify: (decision: ClarifyDecision, answers: Record<string, string[]>) => void;
}) {
  return (
    <div
      data-decision={decision.kind}
      className="flex flex-col gap-[9px] rounded-xl bg-[color-mix(in_srgb,var(--wait)_13%,transparent)] p-[13px]"
    >
      <div className="flex items-center gap-2">
        <span className="font-ui text-[13px] text-[var(--text)]">{asker}</span>
        <div className="flex-1" />
        <span className="rounded-full bg-[color-mix(in_srgb,var(--wait)_16%,transparent)] px-2 py-px font-ui text-[11px] text-[var(--wait)] whitespace-nowrap">
          waiting on you
        </span>
      </div>
      {decision.kind === "approval" ? (
        <ApprovalBody decision={decision} busy={busy} onApprove={onApprove} />
      ) : (
        <ClarifyBody decision={decision} busy={busy} onClarify={onClarify} />
      )}
    </div>
  );
}

function ApprovalBody({
  decision,
  busy,
  onApprove,
}: {
  decision: ApprovalDecision;
  busy: boolean;
  onApprove: (decision: ApprovalDecision, choice: ApprovalChoice) => void;
}) {
  return (
    <>
      <span className="font-ui text-[13px] font-medium text-[var(--wait)]">This step needs your confirmation</span>
      <div className="rounded-md bg-[var(--crust)] px-[9px] py-[9px]">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--text)]">
          {decision.command || decision.description}
        </pre>
        {decision.command && decision.description ? (
          <p className="mt-1.5 font-ui text-[12px] text-[var(--text-muted)]">{decision.description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-[7px]">
        {decision.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={busy}
            onClick={() => onApprove(decision, choice)}
            className={cn(PILL, choice === "deny" ? PILL_PLAIN : PILL_GO)}
          >
            {approvalChoiceLabel(choice)}
          </button>
        ))}
      </div>
    </>
  );
}

function ClarifyBody({
  decision,
  busy,
  onClarify,
}: {
  decision: ClarifyDecision;
  busy: boolean;
  onClarify: (decision: ClarifyDecision, answers: Record<string, string[]>) => void;
}) {
  const single = decision.questions.length === 1;
  const only = decision.questions[0];
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const keyOf = (index: number) => decision.questions[index].qid ?? String(index);

  // One question with single-select choices answers on the click itself.
  if (single && only.choices.length > 0 && !only.multiSelect) {
    return (
      <>
        <span className="font-ui text-[13px] font-medium text-[var(--wait)]">{only.question}</span>
        <div className="flex flex-wrap items-center gap-[7px]">
          {only.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={busy}
              onClick={() => onClarify(decision, { [keyOf(0)]: [choice] })}
              className={cn(PILL, PILL_GO)}
            >
              {choice}
            </button>
          ))}
        </div>
      </>
    );
  }

  const complete = decision.questions.every((q, i) => {
    const key = keyOf(i);
    if (q.choices.length === 0) return Boolean(typed[key]?.trim());
    return (answers[key]?.length ?? 0) > 0;
  });

  const submit = () => {
    const out: Record<string, string[]> = {};
    decision.questions.forEach((q, i) => {
      const key = keyOf(i);
      out[key] = q.choices.length === 0 ? [typed[key]?.trim() ?? ""] : (answers[key] ?? []);
    });
    onClarify(decision, out);
  };

  return (
    <>
      {decision.questions.map((q, i) => {
        const key = keyOf(i);
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="font-ui text-[13px] font-medium text-[var(--wait)]">{q.question}</span>
            {q.choices.length === 0 ? (
              <input
                type="text"
                value={typed[key] ?? ""}
                onChange={(e) => setTyped((t) => ({ ...t, [key]: e.target.value }))}
                placeholder="Your answer"
                className="rounded-lg border border-[var(--border)] bg-[var(--base)] px-2.5 py-1.5 font-ui text-[13px] text-[var(--text)] outline-none focus-visible:border-[var(--accent)]"
              />
            ) : q.multiSelect ? (
              <div className="flex flex-col gap-1">
                {q.choices.map((choice) => {
                  const checked = (answers[key] ?? []).includes(choice);
                  return (
                    <label key={choice} className="flex items-center gap-2 font-ui text-[13px] text-[var(--text)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAnswers((a) => ({
                            ...a,
                            [key]: checked
                              ? (a[key] ?? []).filter((c) => c !== choice)
                              : [...(a[key] ?? []), choice],
                          }))
                        }
                        className="h-3.5 w-3.5 accent-[var(--accent)]"
                      />
                      {choice}
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-[7px]">
                {q.choices.map((choice) => {
                  const selected = (answers[key] ?? [])[0] === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setAnswers((a) => ({ ...a, [key]: [choice] }))}
                      className={cn(PILL, selected ? PILL_GO : PILL_PLAIN)}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-[7px]">
        <button type="button" disabled={busy || !complete} onClick={submit} className={cn(PILL, PILL_GO)}>
          Confirm
        </button>
      </div>
    </>
  );
}
