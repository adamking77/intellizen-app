import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acpGatewayClient,
  createAcpSession,
  interruptAcpSession,
  onAcpEvent,
  optionIdForChoice,
  resetAcpSubscription,
  respondAcpApproval,
  runAcpPrompt,
  setAcpBridge,
  submitAcpPrompt,
  type AcpBridge,
  type AcpEnvelope,
} from "./acp-session";
import { createTranscript, reduceTranscript } from "./transcript";
import { TurnError } from "./session";

class FakeBridge implements AcpBridge {
  calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  sessionIds = new Map<string, string>();
  startGate: Promise<void> | null = null;
  private handlers = new Set<(e: AcpEnvelope) => void>();
  listenCount = 0;
  failOn: string | null = null;
  stringFailure = false;

  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    this.calls.push({ command, args });
    if (this.failOn === command) {
      if (this.stringFailure) throw `${command} refused by native policy`;
      throw new Error(`${command} refused`);
    }
    if (command === "acp_start") {
      await this.startGate;
      const caller = String(args?.caller ?? "");
      return { agentId: args?.agentId, sessionId: this.sessionIds.get(caller) ?? (caller === "room:alpha" ? "sess-room" : "sess-1"), pid: 42 } as T;
    }
    return undefined as T;
  }

  async listen(handler: (e: AcpEnvelope) => void) {
    this.listenCount += 1;
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(type: AcpEnvelope["type"], payload: unknown, sessionId = "sess-1", agentId = "cc") {
    for (const h of this.handlers) h({ agent_id: agentId, type, session_id: sessionId, payload });
  }
}

const options = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "allow-always", name: "Always", kind: "allow_always" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
];

let bridge: FakeBridge;

beforeEach(() => {
  bridge = new FakeBridge();
  setAcpBridge(bridge);
});
afterEach(() => {
  setAcpBridge(null);
  resetAcpSubscription();
});

describe("acp session helpers send the Tauri command shapes", () => {
  it("start, prompt and cancel address the agent", async () => {
    await expect(createAcpSession("cc")).resolves.toBe("sess-1");
    await submitAcpPrompt("sess-1", "hello");
    await interruptAcpSession("sess-1");
    expect(bridge.calls).toEqual([
      { command: "acp_start", args: { agentId: "cc", caller: "panel" } },
      { command: "acp_prompt", args: { sessionId: "sess-1", text: "hello" } },
      { command: "acp_cancel", args: { sessionId: "sess-1" } },
    ]);
    expect(bridge.listenCount).toBe(1);
  });

  it("starts workflow read-only work in a separate restricted process", async () => {
    await expect(createAcpSession("cc", "workflow", null, "read-only")).resolves.toBe("sess-1");
    expect(bridge.calls[0]).toEqual({
      command: "acp_start",
      args: { agentId: "cc", caller: "workflow", mode: "read-only" },
    });
  });

  it("presents the gateway-shaped client used by rooms", async () => {
    const client = acpGatewayClient("cc", "room:one");
    expect(client.connectionState).toBe("open");
    await expect(client.request("session.create")).resolves.toEqual({ session_id: "sess-1" });
    await client.request("prompt.submit", { text: "room hello" });
    expect(bridge.calls.slice(-2)).toEqual([
      { command: "acp_start", args: { agentId: "cc", caller: "room:one" } },
      { command: "acp_prompt", args: { sessionId: "sess-1", text: "room hello" } },
    ]);
  });

  it("keeps the panel and each room on separate ACP sessions", async () => {
    const panel = acpGatewayClient("cc", "panel");
    const room = acpGatewayClient("cc", "room:alpha");
    await panel.request("session.create", { cwd: "/work/app" });
    await room.request("session.create", { cwd: "/work/app" });
    await room.request("prompt.submit", { text: "room only" });
    expect(bridge.calls.slice(-3)).toEqual([
      { command: "acp_start", args: { agentId: "cc", caller: "panel", cwd: "/work/app" } },
      { command: "acp_start", args: { agentId: "cc", caller: "room:alpha", cwd: "/work/app" } },
      { command: "acp_prompt", args: { sessionId: "sess-room", text: "room only" } },
    ]);
  });

  it("maps displayed choices only to the exact adapter option", () => {
    expect(optionIdForChoice(options, "once")).toBe("allow");
    expect(optionIdForChoice(options, "always")).toBe("allow-always");
    expect(optionIdForChoice(options, "deny")).toBe("reject");
    expect(optionIdForChoice([
      ...options,
      { optionId: "reject-always", name: "Always reject", kind: "reject_always" },
    ], "deny_always")).toBe("reject-always");
    expect(optionIdForChoice(options, "session")).toBeNull();
    expect(optionIdForChoice([{ optionId: "only" }], "deny")).toBeNull();
    expect(optionIdForChoice([], "once")).toBeNull();
  });

  it("answers an approval with the option the adapter offered", async () => {
    onAcpEvent(() => undefined);
    await Promise.resolve();
    bridge.emit("approval.request", { request_id: "perm-7", command: "rm -rf x", choices: ["once", "always", "deny"], options });
    await respondAcpApproval({ sessionId: "sess-1", requestId: "perm-7", choice: "deny" });
    expect(bridge.calls.at(-1)).toEqual({
      command: "acp_respond_permission",
      args: { sessionId: "sess-1", requestId: "perm-7", optionId: "reject" },
    });
    await expect(respondAcpApproval({ sessionId: "sess-1", requestId: "perm-7", choice: "once" })).rejects.toThrow("No pending permission");
  });
});

describe("acp envelopes fold into the transcript unchanged", () => {
  it("renders a streamed reply, a tool row and an approval card", async () => {
    let state = createTranscript("Claude Code");
    onAcpEvent((e) => {
      state = reduceTranscript(state, e, 1000);
    });
    await Promise.resolve();
    state = { ...state, turnStartedAt: 900 };
    bridge.emit("message.start", {});
    bridge.emit("message.delta", { text: "po" });
    bridge.emit("tool.start", { tool_id: "t1", name: "execute", context: "date" });
    bridge.emit("approval.request", { request_id: "perm-1", command: "date", description: "execute · date", choices: ["once", "deny"], options });
    bridge.emit("tool.complete", { tool_id: "t1", result: { output: "Wed" }, result_text: "Wed", duration_s: 0.5 });
    bridge.emit("message.delta", { text: "ng" });
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]).toMatchObject({ kind: "approval", requestId: "perm-1", choices: ["once", "deny"] });
    bridge.emit("message.complete", { status: "complete" });
    const turn = state.messages[0];
    expect(turn.text).toBe("pong");
    expect(turn.tools).toEqual([{ id: "t1", name: "execute", title: "date", ok: true, resultText: "Wed", durationMs: 500 }]);
    expect(turn.streaming).toBe(false);
    expect(state.lastTurn?.status).toBe("complete");
  });
});

describe("runAcpPrompt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the streamed text and denies an unattended permission", async () => {
    const run = runAcpPrompt({ agentId: "cc", text: "ping" });
    await vi.advanceTimersByTimeAsync(0);
    bridge.emit("message.delta", { text: "po" });
    bridge.emit("approval.request", { request_id: "perm-2", choices: ["once", "deny"], options });
    await vi.advanceTimersByTimeAsync(0);
    bridge.emit("message.delta", { text: "ng" }, "other-session");
    bridge.emit("message.delta", { text: "ng" });
    bridge.emit("message.complete", { status: "complete" });
    await expect(run).resolves.toEqual({ sessionId: "sess-1", text: "pong" });
    expect(bridge.calls.find((c) => c.command === "acp_respond_permission")?.args).toEqual({
      sessionId: "sess-1",
      requestId: "perm-2",
      optionId: "reject",
    });
  });

  it("keeps concurrent isolated callers on separate sessions and stops each one", async () => {
    bridge.sessionIds.set("workflow:assignment-a", "sess-a");
    bridge.sessionIds.set("workflow:assignment-b", "sess-b");
    const first = runAcpPrompt({ agentId: "cc", text: "first", caller: "workflow:assignment-a", mode: "read-only", isolated: true });
    const second = runAcpPrompt({ agentId: "cc", text: "second", caller: "workflow:assignment-b", mode: "read-only", isolated: true });
    await vi.advanceTimersByTimeAsync(0);
    bridge.emit("message.delta", { text: "two" }, "sess-b");
    bridge.emit("message.complete", { status: "complete" }, "sess-b");
    bridge.emit("message.delta", { text: "one" }, "sess-a");
    bridge.emit("message.complete", { status: "complete" }, "sess-a");
    await expect(first).resolves.toEqual({ sessionId: "sess-a", text: "one" });
    await expect(second).resolves.toEqual({ sessionId: "sess-b", text: "two" });
    expect(bridge.calls.filter((call) => call.command === "acp_start").map((call) => call.args?.caller)).toEqual(["workflow:assignment-a", "workflow:assignment-b"]);
    expect(bridge.calls.filter((call) => call.command === "acp_stop").map((call) => call.args?.sessionId).sort()).toEqual(["sess-a", "sess-b"]);
  });

  it("does not submit when the signal aborts while an isolated session starts", async () => {
    let releaseStart!: () => void;
    bridge.startGate = new Promise((resolve) => { releaseStart = resolve; });
    const controller = new AbortController();
    const run = expect(runAcpPrompt({ agentId: "cc", text: "x", caller: "workflow:delayed", mode: "read-only", isolated: true, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    releaseStart();
    await run;
    expect(bridge.calls.map((call) => call.command)).toEqual(["acp_start", "acp_cancel", "acp_stop"]);
  });

  it("requires an explicit caller for isolated work", async () => {
    await expect(runAcpPrompt({ agentId: "cc", text: "x", mode: "read-only", isolated: true })).rejects.toThrow("explicit caller");
    expect(bridge.calls).toEqual([]);
  });

  it("preserves a native session-start rejection as an Error", async () => {
    bridge.failOn = "acp_start";
    bridge.stringFailure = true;
    await expect(runAcpPrompt({ agentId: "cc", text: "x", caller: "workflow:rejected", mode: "read-only", isolated: true }))
      .rejects.toThrow("acp_start refused by native policy");
  });

  it("rejects on an error, an interruption and a timeout", async () => {
    const failed = expect(runAcpPrompt({ agentId: "cc", text: "x", caller: "workflow:failed", mode: "read-only", isolated: true })).rejects.toMatchObject({
      name: "TurnError",
      status: "error",
      message: "not logged in",
    });
    await vi.advanceTimersByTimeAsync(0);
    bridge.emit("message.complete", { status: "error", error: "not logged in" });
    await failed;

    const stopped = expect(runAcpPrompt({ agentId: "cc", text: "x", caller: "workflow:stopped", mode: "read-only", isolated: true })).rejects.toBeInstanceOf(TurnError);
    await vi.advanceTimersByTimeAsync(0);
    bridge.emit("message.complete", { status: "interrupted" });
    await stopped;

    const slow = expect(runAcpPrompt({ agentId: "cc", text: "x", caller: "workflow:slow", mode: "read-only", isolated: true, timeoutMs: 1_000 })).rejects.toMatchObject({
      status: "timeout",
    });
    await vi.advanceTimersByTimeAsync(1_001);
    await slow;
    expect(bridge.calls.filter((c) => c.command === "acp_cancel")).toHaveLength(1);
    expect(bridge.calls.filter((c) => c.command === "acp_stop")).toHaveLength(3);
  });

  it("stops an isolated session after abort", async () => {
    const controller = new AbortController();
    const run = expect(runAcpPrompt({ agentId: "cc", text: "x", caller: "workflow:abort", mode: "read-only", isolated: true, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await run;
    expect(bridge.calls.filter((call) => call.command === "acp_stop")).toEqual([{ command: "acp_stop", args: { sessionId: "sess-1" } }]);
  });

  it("surfaces a prompt the adapter refused", async () => {
    bridge.failOn = "acp_prompt";
    const run = expect(runAcpPrompt({ agentId: "cc", text: "x", caller: "workflow:refused", mode: "read-only", isolated: true })).rejects.toThrow("acp_prompt refused");
    await vi.advanceTimersByTimeAsync(0);
    await run;
    expect(bridge.calls.at(-1)).toEqual({ command: "acp_stop", args: { sessionId: "sess-1" } });
  });
});
