import { useState } from "react";

import { Control } from "@/components/ui/control";
import { Choices } from "@/components/ui/choices";
import { DecisionField } from "@/components/ui/decision-field";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
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
  const asked = new Date(decision.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (decision.kind === "approval") {
    return (
      <DecisionField
        data-decision="approval"
        question="May this step continue?"
        why={[asker, `asked ${asked}`, decision.command, decision.description].filter(Boolean).join(" · ")}
        choices={decision.choices.map((choice) => ({
          id: choice,
          label: approvalChoiceLabel(choice),
          disabled: busy,
        }))}
        onChoose={(choice) => onApprove(decision, choice as ApprovalChoice)}
      />
    );
  }
  return <ClarifyField key={decision.requestId} decision={decision} asker={asker} asked={asked} busy={busy} onClarify={onClarify} />;
}

function ClarifyField({
  decision,
  asker,
  asked,
  busy,
  onClarify,
}: {
  decision: ClarifyDecision;
  asker: string;
  asked: string;
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
        why={`${asker} · asked ${asked}`}
        choices={only.choices.map((choice) => ({ id: choice, label: choice, disabled: busy }))}
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
    <Surface data-decision="clarify" className="grid gap-3">
      <div>
        <Eyebrow tone="question">A question for you</Eyebrow>
        <div className="mt-0.5 font-mono text-[length:var(--t-count)] text-[var(--text-dim)]">{asker} · asked {asked}</div>
      </div>
      {decision.questions.map((question, index) => {
        const key = keyOf(index);
        return (
          <div key={key} className="grid gap-1.5">
            <span className="text-[length:var(--t-ui)] font-medium text-[var(--text)]">{question.question}</span>
            {question.choices.length === 0 ? (
              <Input disabled={busy} value={typed[key] ?? ""} onChange={(event) => setTyped((current) => ({ ...current, [key]: event.target.value }))} placeholder="Your answer" />
            ) : (
              <Choices
                label={question.question}
                choices={question.choices.map((choice) => ({
                  id: choice,
                  label: (answers[key] ?? []).includes(choice) ? `${choice} · selected` : choice,
                  disabled: busy,
                  quiet: !(answers[key] ?? []).includes(choice),
                }))}
                onChoose={(choice) => setAnswers((current) => {
                  const selected = (current[key] ?? []).includes(choice);
                  return {
                    ...current,
                    [key]: question.multiSelect
                      ? selected
                        ? (current[key] ?? []).filter((item) => item !== choice)
                        : [...(current[key] ?? []), choice]
                      : [choice],
                  };
                })}
              />
            )}
          </div>
        );
      })}
      <Control variant="text" size="sm" className="w-fit" disabled={busy || !complete} onClick={submit}>Confirm</Control>
    </Surface>
  );
}
