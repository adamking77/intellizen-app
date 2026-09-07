// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApprovalDecision, ClarifyDecision } from "@/engine/transcript";
import { DecisionCard } from "./decision-card";

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => act(async () => root.unmount())));
});

function approval(): ApprovalDecision {
  return {
    kind: "approval",
    requestId: "approval-1",
    command: "write report",
    description: "Write the reviewed report to disk",
    choices: ["once", "deny"],
    messageId: "m1",
    at: 1,
  };
}

function clarify(requestId: string, question: string): ClarifyDecision {
  return {
    kind: "clarify",
    requestId,
    questions: [{ qid: "answer", question, choices: [], multiSelect: false }],
    messageId: "m1",
    at: 1,
  };
}

describe("DecisionCard", () => {
  it("keeps approval choices equal-weight when no recommendation exists", async () => {
    const host = document.createElement("div");
    const root = createRoot(host); roots.push(root);
    await act(async () => root.render(<DecisionCard decision={approval()} asker="Keel" busy={false} onApprove={vi.fn()} onClarify={vi.fn()} />));

    expect(host.textContent).toContain("A question for you");
    expect(host.textContent).toContain("Write the reviewed report to disk");
    expect(host.textContent).not.toContain("recommended");
    expect(Array.from(host.querySelectorAll("button")).every((button) => button.className.includes("underline"))).toBe(true);
  });

  it("clears a free-text answer when a new request replaces the card and disables it while sending", async () => {
    const host = document.createElement("div");
    const root = createRoot(host); roots.push(root);
    const render = (decision: ClarifyDecision, busy = false) => root.render(
      <DecisionCard decision={decision} asker="Fable" busy={busy} onApprove={vi.fn()} onClarify={vi.fn()} />,
    );
    await act(async () => render(clarify("clarify-1", "First question")));
    const input = host.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Old answer");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => render(clarify("clarify-2", "Second question"), true));

    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("");
    expect(host.querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
  });
});
