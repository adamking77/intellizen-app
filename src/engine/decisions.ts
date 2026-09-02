// Answering the gateway's blocking requests. Parameter names follow
// `tui_gateway/methods_prompt.py` at the pinned revision: `approval.respond`
// resolves through the session (`session_id`, `request_id`, `choice`,
// `all`); `clarify.respond` resolves through `_respond` (`request_id`,
// `answer`, optional `question_id` for a batch).

import { request, type ApprovalChoice, type GatewayClientLike } from "./contract";
import type { ApprovalDecision, ClarifyDecision } from "./transcript";

export const APPROVAL_CHOICE_LABEL: Record<ApprovalChoice, string> = {
  once: "Allow once",
  session: "Allow this session",
  always: "Always allow",
  deny: "Deny",
};

const APPROVAL_CHOICE_PAST: Record<ApprovalChoice, string> = {
  once: "Allowed once",
  session: "Allowed for this session",
  always: "Always allowed",
  deny: "Denied",
};

export function approvalChoiceLabel(choice: ApprovalChoice | string): string {
  return APPROVAL_CHOICE_LABEL[choice as ApprovalChoice] ?? choice;
}

/** The fact line an answered approval settles into: "Allowed once · rm -rf …". */
export function approvalSummary(decision: ApprovalDecision, choice: ApprovalChoice): string {
  const what = decision.command.trim() || decision.description.trim();
  const verb = APPROVAL_CHOICE_PAST[choice] ?? choice;
  return what ? `${verb} · ${truncate(what, 72)}` : verb;
}

export function clarifySummary(_decision: ClarifyDecision, answer: string): string {
  const a = answer.trim() || "(no answer)";
  return `Answered · ${truncate(a, 72)}`;
}

function truncate(value: string, max: number): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export async function respondApproval(
  client: GatewayClientLike,
  input: { sessionId: string; requestId: string; choice: ApprovalChoice; all?: boolean },
): Promise<{ resolved?: number }> {
  const params: Record<string, unknown> = {
    session_id: input.sessionId,
    request_id: input.requestId,
    choice: input.choice,
  };
  if (input.all) params.all = true;
  return request<{ resolved?: number }>(client, "approval.respond", params);
}

export async function respondClarify(
  client: GatewayClientLike,
  input: { requestId: string; answer: string; questionId?: string },
): Promise<{ status?: string; remaining?: string[] }> {
  const params: Record<string, unknown> = {
    request_id: input.requestId,
    answer: input.answer,
  };
  if (input.questionId) params.question_id = input.questionId;
  return request<{ status?: string; remaining?: string[] }>(client, "clarify.respond", params);
}

/** Answer every question of a clarify request. A single question sends one
 *  `answer`; a batch sends one per `qid` and Hermes releases the tool when
 *  the last one lands. Multi-select answers are joined with ", " (the tool
 *  splits a comma list back into choices). */
export async function answerClarify(
  client: GatewayClientLike,
  decision: ClarifyDecision,
  answers: Record<string, string[]>,
): Promise<void> {
  const batch = decision.questions.length > 1 || decision.questions.some((q) => q.qid);
  if (!batch) {
    const only = decision.questions[0];
    const answer = (answers[only?.qid ?? "0"] ?? []).join(", ");
    await respondClarify(client, { requestId: decision.requestId, answer });
    return;
  }
  for (const [index, question] of decision.questions.entries()) {
    const key = question.qid ?? String(index);
    const answer = (answers[key] ?? []).join(", ");
    await respondClarify(client, {
      requestId: decision.requestId,
      answer,
      questionId: question.qid ?? key,
    });
  }
}
