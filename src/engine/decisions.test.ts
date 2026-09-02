import { describe, expect, it } from "vitest";

import {
  answerClarify,
  approvalChoiceLabel,
  approvalSummary,
  clarifySummary,
  respondApproval,
  respondClarify,
} from "./decisions";
import { FakeGatewayClient } from "./test-support";
import type { ApprovalDecision, ClarifyDecision } from "./transcript";

const approval: ApprovalDecision = {
  kind: "approval",
  requestId: "a2e15e7326f54a6d908cc9ad88c4ce8f",
  command: "cd /tmp && rm -rf iz-approval-dir",
  description: "recursive delete",
  choices: ["once", "session", "always", "deny"],
  messageId: "t2",
  at: 0,
};

describe("approval.respond", () => {
  it("sends session_id, request_id and choice as methods_prompt.py reads them", async () => {
    const client = new FakeGatewayClient();
    client.respondWith((call) => (call.method === "approval.respond" ? { resolved: 1 } : undefined));
    await expect(
      respondApproval(client, { sessionId: "0a0af183", requestId: approval.requestId, choice: "once" }),
    ).resolves.toEqual({ resolved: 1 });
    expect(client.calls[0]).toMatchObject({
      method: "approval.respond",
      params: { session_id: "0a0af183", request_id: approval.requestId, choice: "once" },
    });
    expect(client.calls[0].params).not.toHaveProperty("all");
  });

  it("passes all=true only when asked", async () => {
    const client = new FakeGatewayClient();
    await respondApproval(client, { sessionId: "s", requestId: "r", choice: "deny", all: true });
    expect(client.calls[0].params).toEqual({ session_id: "s", request_id: "r", choice: "deny", all: true });
  });

  it("labels the four choices in Hermes's order and settles into a fact line", () => {
    expect(approval.choices.map(approvalChoiceLabel)).toEqual([
      "Allow once",
      "Allow this session",
      "Always allow",
      "Deny",
    ]);
    expect(approvalSummary(approval, "once")).toBe("Allowed once · cd /tmp && rm -rf iz-approval-dir");
    expect(approvalSummary(approval, "deny")).toBe("Denied · cd /tmp && rm -rf iz-approval-dir");
    expect(approvalSummary({ ...approval, command: "" }, "session")).toBe("Allowed for this session · recursive delete");
  });
});

describe("clarify.respond", () => {
  it("sends request_id and answer, with question_id only for a batch", async () => {
    const client = new FakeGatewayClient();
    await respondClarify(client, { requestId: "r1", answer: "yes" });
    expect(client.calls[0].params).toEqual({ request_id: "r1", answer: "yes" });
    await respondClarify(client, { requestId: "r1", answer: "a", questionId: "q1" });
    expect(client.calls[1].params).toEqual({ request_id: "r1", answer: "a", question_id: "q1" });
  });

  it("answers a single question once and a batch once per qid", async () => {
    const client = new FakeGatewayClient();
    const single: ClarifyDecision = {
      kind: "clarify",
      requestId: "r1",
      messageId: "t2",
      at: 0,
      questions: [{ question: "Proceed?", choices: ["yes", "no"], multiSelect: false }],
    };
    await answerClarify(client, single, { "0": ["yes"] });
    expect(client.calls.map((c) => c.params)).toEqual([{ request_id: "r1", answer: "yes" }]);

    const batch: ClarifyDecision = {
      ...single,
      requestId: "r2",
      questions: [
        { qid: "q1", question: "Folder?", choices: ["a", "b"], multiSelect: false },
        { qid: "q2", question: "Files?", choices: ["x", "y"], multiSelect: true },
      ],
    };
    client.calls = [];
    await answerClarify(client, batch, { q1: ["a"], q2: ["x", "y"] });
    expect(client.calls.map((c) => c.params)).toEqual([
      { request_id: "r2", answer: "a", question_id: "q1" },
      { request_id: "r2", answer: "x, y", question_id: "q2" },
    ]);
    expect(clarifySummary(batch, "a, x, y")).toBe("Answered · a, x, y");
  });
});
