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
  private handlers = new Set<(e: AcpEnvelope) => void>();
  listenCount = 0;
  failOn: string | null = null;

  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    this.calls.push({ command, args });
    if (this.failOn === command) throw new Error(`${command} refused`);
    if (command === "acp_start") {
      return { agentId: args?.agentId, sessionId: "sess-1", pid: 42 } as T;
    }
    return undefined as T;
  }

  async listen(handler: (e: AcpEnvelope) => void) {
    this.listenCount += 1;
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(type: AcpEnvelope["type"], payload: unknown, agentId = "cc") {
    for (const h of this.handlers) h({ agent_id: agentId, type, session_id: "sess-1", payload });
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
    await submitAcpPrompt("cc", "hello");
    await interruptAcpSession("cc");
    expect(bridge.calls).toEqual([
      { command: "acp_start", args: { agentId: "cc" } },
      { command: "acp_prompt", args: { agentId: "cc", text: "hello" } },
      { command: "acp_cancel", args: { agentId: "cc" } },
    ]);
    expect(bridge.listenCount).toBe(1);
  });

  it("presents the gateway-shaped client used by rooms", async () => {
    const client = acpGatewayClient("cc");
    expect(client.connectionState).toBe("open");
    await expect(client.request("session.create")).resolves.toEqual({ session_id: "sess-1" });
    await client.request("prompt.submit", { text: "room hello" });
    expect(bridge.calls.slice(-2)).toEqual([
      { command: "acp_start", args: { agentId: "cc" } },
      { command: "acp_prompt", args: { agentId: "cc", text: "room hello" } },
    ]);
  });

  it("maps Hermes's choices onto the adapter's options", () => {
    expect(optionIdForChoice(options, "once")).toBe("allow");
    expect(optionIdForChoice(options, "session")).toBe("allow-always");
    expect(optionIdForChoice(options, "always")).toBe("allow-always");
    expect(optionIdForChoice(options, "deny")).toBe("reject");
    expect(optionIdForChoice([{ optionId: "only" }], "deny")).toBe("only");
    expect(optionIdForChoice([], "once")).toBeNull();
  });

  it("answers an approval with the option the adapter offered", async () => {
    onAcpEvent(() => undefined);
    await Promise.resolve();
    bridge.emit("approval.request", { request_id: "perm-7", command: "rm -rf x", choices: ["once", "always", "deny"], options });
    await respondAcpApproval({ agentId: "cc", requestId: "perm-7", choice: "deny" });
    expect(bridge.calls.at(-1)).toEqual({
      command: "acp_respond_permission",
      args: { agentId: "cc", requestId: "perm-7", optionId: "reject" },
    });
    await expect(respondAcpApproval({ agentId: "cc", requestId: "perm-7", choice: "once" })).rejects.toThrow("No pending permission");
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
    bridge.emit("message.delta", { text: "ng" }, "other-agent");
    bridge.emit("message.delta", { text: "ng" });
    bridge.emit("message.complete", { status: "complete" });
    await expect(run).resolves.toEqual({ sessionId: "sess-1", text: "pong" });
    expect(bridge.calls.find((c) => c.command === "acp_respond_permission")?.args).toEqual({
      agentId: "cc",
      requestId: "perm-2",
      optionId: "reject",
    });
  });

  it("rejects on an error, an interruption and a timeout", async () => {
    const failed = expect(runAcpPrompt({ agentId: "cc", text: "x" })).rejects.toMatchObject({
      name: "TurnError",
      status: "error",
      message: "not logged in",
    });
    await vi.advanceTimersByTimeAsync(0);
    bridge.emit("message.complete", { status: "error", error: "not logged in" });
    await failed;

    const stopped = expect(runAcpPrompt({ agentId: "cc", text: "x" })).rejects.toBeInstanceOf(TurnError);
    await vi.advanceTimersByTimeAsync(0);
    bridge.emit("message.complete", { status: "interrupted" });
    await stopped;

    const slow = expect(runAcpPrompt({ agentId: "cc", text: "x", timeoutMs: 1_000 })).rejects.toMatchObject({
      status: "timeout",
    });
    await vi.advanceTimersByTimeAsync(1_001);
    await slow;
    expect(bridge.calls.filter((c) => c.command === "acp_cancel")).toHaveLength(1);
  });

  it("surfaces a prompt the adapter refused", async () => {
    bridge.failOn = "acp_prompt";
    const run = expect(runAcpPrompt({ agentId: "cc", text: "x" })).rejects.toThrow("acp_prompt refused");
    await vi.advanceTimersByTimeAsync(0);
    await run;
  });
});
