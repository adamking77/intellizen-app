import { describe, expect, it } from "vitest";

import { GATEWAY_EVENTS } from "./contract";
import {
  applyTranscriptAction,
  createTranscript,
  reduceTranscript,
  transcriptBusy,
  type TranscriptState,
} from "./transcript";
import { loadTurn, turnEvents } from "./test-support";

function replay(name: "default-date-turn" | "default-approval-turn") {
  const turn = loadTurn(name);
  const events = turnEvents(turn).filter((e) => e.event.session_id === turn.sessionId);
  let state = createTranscript(turn.profile);
  state = applyTranscriptAction(state, { type: "user", text: turn.prompt, at: 0 });
  for (const { t, event } of events) state = reduceTranscript(state, event, t);
  return { turn, events, state };
}

describe("reduceTranscript on the recorded `default` date turn", () => {
  it("produces one user turn and one settled agent turn", () => {
    const { turn, state } = replay("default-date-turn");
    expect(state.messages).toHaveLength(2);
    const [you, agent] = state.messages;
    expect(you.from).toBe("you");
    expect(you.text).toBe(turn.prompt);
    expect(agent.from).toBe("default");
    expect(agent.streaming).toBe(false);
    expect(agent.failed).toBeUndefined();
    expect(agent.prompt).toBe(turn.prompt);
    expect(agent.text).toBe("The current date is **Wed Sep 2 10:05:48 +04 2026**.");
    expect(agent.tookMs).toBeGreaterThan(0);
    expect(agent.at).toBeGreaterThanOrEqual(0);
  });

  it("opens the tool row on tool.start and settles it on tool.complete", () => {
    const { state } = replay("default-date-turn");
    const agent = state.messages[1];
    expect(agent.tools).toHaveLength(1);
    const tool = agent.tools![0];
    expect(tool.id).toBe("call_00_ET_wo2AG56J7UArTluNc4qt0792");
    expect(tool.name).toBe("terminal");
    expect(tool.title).toBe("date");
    expect(tool.ok).toBe(true);
    expect(tool.resultText).toBe("Wed Sep  2 10:05:48 +04 2026");
    expect(tool.durationMs).toBe(197);
  });

  it("shows the tool as running between tool.start and tool.complete", () => {
    const turn = loadTurn("default-date-turn");
    const events = turnEvents(turn);
    let state = createTranscript(turn.profile);
    state = applyTranscriptAction(state, { type: "user", text: turn.prompt, at: 0 });
    const startIndex = events.findIndex((e) => e.event.type === "tool.start");
    for (const { t, event } of events.slice(0, startIndex + 1)) state = reduceTranscript(state, event, t);
    const running = state.messages[1].tools![0];
    expect(running.ok).toBeUndefined();
    expect(running.title).toBe("date");
    expect(state.messages[1].streaming).toBe(true);
    expect(transcriptBusy(state)).toBe(true);
  });

  it("ends the turn on message.complete: no pending, no status, outcome recorded", () => {
    const { state } = replay("default-date-turn");
    expect(state.pending).toEqual([]);
    expect(state.status).toBeNull();
    expect(state.turnStartedAt).toBeNull();
    expect(transcriptBusy(state)).toBe(false);
    expect(state.lastTurn?.ok).toBe(true);
    expect(state.lastTurn?.status).toBe("complete");
    expect(state.usage?.total).toBeGreaterThan(0);
  });

  it("reads the session's approval mode from session.info", () => {
    const { state } = replay("default-date-turn");
    expect(state.approvalMode).toBe("manual");
  });

  it("treats thinking.delta as a progress label, not the model's thought", () => {
    const turn = loadTurn("default-date-turn");
    const events = turnEvents(turn);
    let state = createTranscript(turn.profile);
    state = applyTranscriptAction(state, { type: "user", text: turn.prompt, at: 0 });
    const first = events.findIndex((e) => e.event.type === "thinking.delta");
    for (const { t, event } of events.slice(0, first + 1)) state = reduceTranscript(state, event, t);
    expect(state.status).toBe("(｡•́︿•̀｡) formulating...");
    expect(state.messages[1].thought).toBeUndefined();
  });

  it("only sees event types the contract lists (plus session bookkeeping)", () => {
    const { events } = replay("default-date-turn");
    const known = new Set<string>(GATEWAY_EVENTS);
    const bookkeeping = new Set(["session.title", "sessions.changed", "tool.generating", "reasoning.available"]);
    for (const { event } of events) {
      expect(known.has(event.type) || bookkeeping.has(event.type)).toBe(true);
    }
  });
});

describe("reduceTranscript on the recorded `default` approval turn", () => {
  function upToApproval() {
    const turn = loadTurn("default-approval-turn");
    const events = turnEvents(turn).filter((e) => e.event.session_id === turn.sessionId);
    let state = createTranscript(turn.profile);
    state = applyTranscriptAction(state, { type: "user", text: turn.prompt, at: 0 });
    const at = events.findIndex((e) => e.event.type === "approval.request");
    for (const { t, event } of events.slice(0, at + 1)) state = reduceTranscript(state, event, t);
    return { turn, events, state, rest: events.slice(at + 1) };
  }

  it("raises an approval decision with the real command and the real choices", () => {
    const { state } = upToApproval();
    expect(state.pending).toHaveLength(1);
    const decision = state.pending[0];
    expect(decision.kind).toBe("approval");
    if (decision.kind !== "approval") return;
    expect(decision.requestId).toBe("a2e15e7326f54a6d908cc9ad88c4ce8f");
    expect(decision.command).toBe("cd /tmp && rm -rf iz-approval-dir");
    expect(decision.description).toBe("recursive delete");
    expect(decision.choices).toEqual(["once", "session", "always", "deny"]);
    expect(decision.messageId).toBe(state.messages[1].id);
    expect(transcriptBusy(state)).toBe(true);
  });

  it("streams reasoning.delta into the turn's thought", () => {
    const { state } = upToApproval();
    expect(state.messages[1].thought?.startsWith("The user wants me to run a shell command")).toBe(true);
  });

  it("settles the decision into a fact line on the turn it arrived in", () => {
    const { state, rest } = upToApproval();
    const decision = state.pending[0];
    let next: TranscriptState = applyTranscriptAction(state, {
      type: "decided",
      requestId: decision.requestId,
      summary: "Allowed once · cd /tmp && rm -rf iz-approval-dir",
      at: 15_500,
    });
    expect(next.pending).toEqual([]);
    expect(next.messages[1].facts).toEqual([
      {
        id: `${next.messages[1].id}-${decision.requestId}`,
        text: "Allowed once · cd /tmp && rm -rf iz-approval-dir",
        at: 15_500,
      },
    ]);
    for (const { t, event } of rest) next = reduceTranscript(next, event, t);
    const agent = next.messages[1];
    expect(agent.streaming).toBe(false);
    expect(agent.text).toBe("It worked — `rm -rf iz-approval-dir` ran cleanly with exit code 0.");
    expect(agent.tools).toHaveLength(1);
    expect(agent.tools![0].ok).toBe(true);
    expect(agent.tools![0].title).toBe("rm -rf iz-approval-dir");
    expect(agent.facts).toHaveLength(1);
    expect(next.lastTurn?.ok).toBe(true);
  });

  it("drops a pending decision when the turn ends without an answer", () => {
    const { state, rest } = upToApproval();
    let next = state;
    for (const { t, event } of rest) next = reduceTranscript(next, event, t);
    expect(next.pending).toEqual([]);
  });
});

describe("reduceTranscript edge cases", () => {
  const base = () =>
    applyTranscriptAction(createTranscript("default"), { type: "user", text: "hi", at: 100 });

  it("drops an edited turn and every later visible turn without erasing on a stale id", () => {
    let state = base();
    state = reduceTranscript(state, { type: "message.delta", session_id: "s", payload: { text: "first reply" } }, 200);
    state = reduceTranscript(state, { type: "message.complete", session_id: "s", payload: { status: "complete" } }, 300);
    state = applyTranscriptAction(state, { type: "user", text: "second", at: 400 });
    const editedId = state.messages[2].id;
    state = reduceTranscript(state, { type: "message.delta", session_id: "s", payload: { text: "second reply" } }, 500);
    state = reduceTranscript(state, { type: "message.complete", session_id: "s", payload: { status: "complete" } }, 600);

    expect(applyTranscriptAction(state, { type: "dropFrom", messageId: "stale" })).toBe(state);
    const rewound = applyTranscriptAction(state, { type: "dropFrom", messageId: editedId });
    expect(rewound.messages.map((message) => message.text)).toEqual(["hi", "first reply"]);
    expect(rewound.lastTurn).toBeNull();
    expect(transcriptBusy(rewound)).toBe(false);
  });

  it("ignores unknown events", () => {
    const state = base();
    expect(reduceTranscript(state, { type: "something.new", session_id: "s", payload: { x: 1 } }, 200)).toBe(state);
  });

  it("marks a turn failed on message.complete with status error", () => {
    let state = base();
    state = reduceTranscript(state, { type: "message.start", session_id: "s" }, 200);
    state = reduceTranscript(
      state,
      { type: "message.complete", session_id: "s", payload: { text: "", status: "error", error: "provider 402: out of credits" } },
      900,
    );
    expect(state.messages[1].failed).toBe("provider 402: out of credits");
    expect(state.messages[1].streaming).toBe(false);
    expect(state.messages[1].tookMs).toBe(800);
    expect(state.lastTurn).toEqual({ ok: false, status: "error", tookMs: 800, at: 900 });
  });

  it("marks an interrupted turn with a Stopped fact and no failure", () => {
    let state = base();
    state = reduceTranscript(state, { type: "message.delta", session_id: "s", payload: { text: "partial" } }, 200);
    state = reduceTranscript(state, { type: "message.complete", session_id: "s", payload: { text: "", status: "interrupted" } }, 300);
    expect(state.messages[1].failed).toBeUndefined();
    expect(state.messages[1].text).toBe("partial");
    expect(state.messages[1].facts?.[0].text).toBe("Stopped");
    expect(state.lastTurn?.status).toBe("interrupted");
  });

  it("falls back to the open tool when tool.complete carries an unknown id", () => {
    let state = base();
    state = reduceTranscript(state, { type: "tool.start", session_id: "s", payload: { tool_id: "a", name: "terminal", context: "ls" } }, 200);
    state = reduceTranscript(
      state,
      { type: "tool.complete", session_id: "s", payload: { name: "terminal", result: { output: "x", exit_code: 1, error: null }, duration_s: 0.5 } },
      300,
    );
    expect(state.messages[1].tools).toEqual([
      { id: "a", name: "terminal", title: "ls", ok: false, resultText: "x", durationMs: 500 },
    ]);
  });

  it("renders a batch clarify request as one decision with every question", () => {
    let state = base();
    state = reduceTranscript(
      state,
      {
        type: "clarify.request",
        session_id: "s",
        payload: {
          request_id: "r1",
          questions: [
            { qid: "q1", question: "Which folder?", choices: ["a", "b"], multi_select: false },
            { qid: "q2", question: "Which files?", choices: ["x", "y"], multi_select: true },
          ],
        },
      },
      200,
    );
    expect(state.pending).toEqual([
      {
        kind: "clarify",
        requestId: "r1",
        messageId: state.messages[1].id,
        at: 200,
        questions: [
          { qid: "q1", question: "Which folder?", choices: ["a", "b"], multiSelect: false },
          { qid: "q2", question: "Which files?", choices: ["x", "y"], multiSelect: true },
        ],
      },
    ]);
  });

  it("removes a decision on its expire event", () => {
    let state = base();
    state = reduceTranscript(state, { type: "clarify.request", session_id: "s", payload: { request_id: "r1", question: "Sure?", choices: ["yes", "no"] } }, 200);
    expect(state.pending).toHaveLength(1);
    state = reduceTranscript(state, { type: "clarify.expire", session_id: "s", payload: { request_id: "r1" } }, 300);
    expect(state.pending).toEqual([]);
  });

  it("records a local failure as a failed agent turn", () => {
    const state = applyTranscriptAction(base(), { type: "failed", reason: "gateway not connected", at: 150 });
    expect(state.messages[1].failed).toBe("gateway not connected");
    expect(state.lastTurn?.ok).toBe(false);
    expect(transcriptBusy(state)).toBe(false);
  });
});
