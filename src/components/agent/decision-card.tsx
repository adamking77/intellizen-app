import { useState } from "react";

import { Control } from "@/components/ui/control";
import { DecisionField } from "@/components/ui/decision-field";
import { Input } from "@/components/ui/input";
import type { ApprovalChoice } from "@/engine/contract";
import { approvalChoiceLabel } from "@/engine/decisions";
import type { ApprovalDecision, ClarifyDecision, Decision } from "@/engine/transcript";

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
  if (decision.kind === "approval") {
    return (
      <DecisionField
        data-decision="approval"
        question="This step needs your confirmation"
        why={[asker, decision.command, decision.description].filter(Boolean).join(" · ")}
        choices={decision.choices.map((choice, index) => ({
          id: choice,
          label: approvalChoiceLabel(choice),
          recommended: choice !== "deny" && index === 0,
          disabled: busy,
        }))}
        onChoose={(choice) => onApprove(decision, choice as ApprovalChoice)}
      />
    );
  }
  return <ClarifyField decision={decision} asker={asker} busy={busy} onClarify={onClarify} />;
}

function ClarifyField({
  decision,
  asker,
  busy,
  onClarify,
}: {
  decision: ClarifyDecision;
  asker: string;
  busy: boolean;
  onClarify: (decision: ClarifyDecision, answers: Record<string, string[]>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const keyOf = (index: number) => decision.questions[index].qid ?? String(index);
  const only = decision.questions.length === 1 ? decision.questions[0] : null;

  if (only && only.choices.length > 0 && !only.multiSelect) {
    return (
      <DecisionField
        data-decision="clarify"
        question={only.question}
        why={asker}
        choices={only.choices.map((choice, index) => ({ id: choice, label: choice, recommended: index === 0, disabled: busy }))}
        onChoose={(choice) => onClarify(decision, { [keyOf(0)]: [choice] })}
      />
    );
  }

  const complete = decision.questions.every((question, index) => {
    const key = keyOf(index);
    return question.choices.length === 0 ? Boolean(typed[key]?.trim()) : Boolean(answers[key]?.length);
  });
  const submit = () => onClarify(
    decision,
    Object.fromEntries(decision.questions.map((question, index) => {
      const key = keyOf(index);
      return [key, question.choices.length === 0 ? [typed[key]?.trim() ?? ""] : answers[key] ?? []];
    })),
  );

  return (
    <div data-decision="clarify" className="grid gap-3 rounded-[var(--r-ctl)] bg-[var(--raised)] px-[13px] py-[11px]">
      <div className="text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--wait)]">Waiting on you · {asker}</div>
      {decision.questions.map((question, index) => {
        const key = keyOf(index);
        return (
          <div key={key} className="grid gap-1.5">
            <span className="text-[var(--t-ui)] font-medium text-[var(--text)]">{question.question}</span>
            {question.choices.length === 0 ? (
              <Input value={typed[key] ?? ""} onChange={(event) => setTyped((current) => ({ ...current, [key]: event.target.value }))} placeholder="Your answer" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {question.choices.map((choice) => {
                  const selected = (answers[key] ?? []).includes(choice);
                  return (
                    <Control
                      key={choice}
                      size="sm"
                      variant={selected ? "selected" : "default"}
                      onClick={() => setAnswers((current) => ({
                        ...current,
                        [key]: question.multiSelect
                          ? selected
                            ? (current[key] ?? []).filter((item) => item !== choice)
                            : [...(current[key] ?? []), choice]
                          : [choice],
                      }))}
                    >
                      {choice}
                    </Control>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <Control variant="primary" size="sm" disabled={busy || !complete} onClick={submit}>Confirm</Control>
    </div>
  );
}
