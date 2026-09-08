// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import type { PanelFrame } from "./panel-window";
import type { ApprovalDecision } from "@/engine/transcript";

const requests = vi.hoisted(() => [] as Array<{ reject: (error: Error) => void }>);
vi.mock("./panel-window", async (original) => ({
  ...await original<typeof import("./panel-window")>(),
  requestAction: vi.fn(() => new Promise<void>((_resolve, reject) => requests.push({ reject }))),
}));

import { emptyThread } from "@/engine/session-store";
import { usePanelSession, type PanelSession } from "./use-panel-session";

const decision: ApprovalDecision = {
  kind: "approval",
  requestId: "shared-request-id",
  command: "write",
  description: "Write output",
  choices: ["once", "deny"],
  messageId: "m1",
  at: 1,
};

function frame(profile: string, deciding: string | null = null): PanelFrame {
  const thread = emptyThread(profile);
  thread.sessionId = `${profile}-session`;
  thread.deciding = deciding;
  thread.transcript.pending = [{ ...decision }];
  return {
    selectedProfile: profile,
    profileDirectory: {},
    threads: { [profile]: thread },
  };
}

it("does not apply a delayed detached decision error to a new profile with the same request id", async () => {
  requests.splice(0);
  const root = createRoot(document.createElement("div"));
  let session!: PanelSession;
  function Harness({ value }: { value: PanelFrame }) {
    session = usePanelSession(value);
    return null;
  }
  try {
    await act(async () => root.render(<Harness value={frame("acp:first")} />));
    let old!: Promise<void>;
    await act(async () => { old = session.decideApproval("acp:first", decision, "once"); });
    expect(session.thread?.deciding).toBe(decision.requestId);

    await act(async () => root.render(<Harness value={frame("acp:second")} />));
    const observed = old.catch((error) => error);
    await act(async () => requests[0].reject(new Error("old owner failed")));
    await observed;

    expect(session.selectedProfile).toBe("acp:second");
    expect(session.thread?.deciding).toBeNull();
    expect(session.decisionError).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it("keeps a detached decision disabled when the receipt fails while the main owner is still processing", async () => {
  requests.splice(0);
  const root = createRoot(document.createElement("div"));
  let session!: PanelSession;
  function Harness() {
    session = usePanelSession(frame("acp:first", decision.requestId));
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    let sending!: Promise<void>;
    await act(async () => { sending = session.decideApproval("acp:first", decision, "once"); });
    const observed = sending.catch((error) => error);
    await act(async () => requests[0].reject(new Error("The response could not be confirmed. The answer may still be processing; choices return if it is rejected.")));
    await observed;

    expect(session.decisionError?.message).toContain("may still be processing");
    expect(session.thread?.deciding).toBe(decision.requestId);
  } finally {
    await act(async () => root.unmount());
  }
});
