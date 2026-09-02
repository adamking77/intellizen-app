import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcGatewayError } from "./json-rpc-gateway";
import { createSession, interruptSession, isSessionNotFound, runPrompt, submitPrompt, TurnError } from "./session";
import { FakeGatewayClient, loadTurn, turnEvents } from "./test-support";

describe("session helpers send the pinned parameter shapes", () => {
  it("session.create carries cols, source, profile and an optional cwd", async () => {
    const client = new FakeGatewayClient();
    const id = await createSession(client, { profile: "default" });
    expect(id).toBe("fake1");
    expect(client.calls[0]).toMatchObject({
      method: "session.create",
      params: { cols: 96, source: "desktop", profile: "default" },
    });
    expect(client.calls[0].params).not.toHaveProperty("cwd");
    await createSession(client, { profile: "fiona", cwd: "/tmp" });
    expect(client.calls[1].params).toEqual({ cols: 96, source: "desktop", profile: "fiona", cwd: "/tmp" });
  });

  it("prompt.submit and session.interrupt address the session", async () => {
    const client = new FakeGatewayClient();
    await submitPrompt(client, "abc", "hello");
    await interruptSession(client, "abc");
    expect(client.calls).toEqual([
      { method: "prompt.submit", params: { session_id: "abc", text: "hello" }, timeoutMs: undefined },
      { method: "session.interrupt", params: { session_id: "abc" }, timeoutMs: undefined },
    ]);
  });

  it("recognises Hermes's session-not-found code", () => {
    expect(isSessionNotFound(new JsonRpcGatewayError("no such session", { code: 4001 }))).toBe(true);
    expect(isSessionNotFound(new JsonRpcGatewayError("busy", { code: 4120 }))).toBe(false);
    expect(isSessionNotFound(new Error("4001"))).toBe(false);
  });
});

describe("runPrompt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the final text when the recorded turn completes", async () => {
    const client = new FakeGatewayClient();
    const turn = loadTurn("default-date-turn");
    client.respondWith((call) =>
      call.method === "session.create" ? { session_id: turn.sessionId } : undefined,
    );
    const run = runPrompt(client, { profile: "default", text: turn.prompt });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.listenerCount).toBe(1);
    for (const { event } of turnEvents(turn)) client.emit(event);
    await expect(run).resolves.toEqual({
      sessionId: turn.sessionId,
      text: "The current date is **Wed Sep 2 10:05:48 +04 2026**.",
    });
    expect(client.listenerCount).toBe(0);
    expect(client.callsTo("prompt.submit")[0].params).toEqual({ session_id: turn.sessionId, text: turn.prompt });
  });

  it("ignores events from other sessions", async () => {
    const client = new FakeGatewayClient();
    const run = runPrompt(client, { profile: "default", text: "hi" });
    await vi.advanceTimersByTimeAsync(0);
    client.emit({ type: "message.complete", session_id: "someone-else", payload: { text: "nope", status: "complete" } });
    let done = false;
    void run.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(false);
    client.emit({ type: "message.complete", session_id: "fake1", payload: { text: "yes", status: "complete" } });
    await expect(run).resolves.toEqual({ sessionId: "fake1", text: "yes" });
  });

  it("rejects with the gateway's error when the turn ends in status error", async () => {
    const client = new FakeGatewayClient();
    const run = runPrompt(client, { profile: "default", text: "hi" });
    await vi.advanceTimersByTimeAsync(0);
    client.emit({ type: "message.complete", session_id: "fake1", payload: { text: "", status: "error", error: "provider 402" } });
    await expect(run).rejects.toMatchObject({ name: "TurnError", status: "error", message: "provider 402" });
    expect(client.listenerCount).toBe(0);
  });

  it("rejects when prompt.submit itself fails", async () => {
    const client = new FakeGatewayClient();
    client.respondWith((call) => {
      if (call.method === "prompt.submit") throw new JsonRpcGatewayError("session busy", { code: 4120 });
      return undefined;
    });
    const run = runPrompt(client, { profile: "default", text: "hi" });
    await expect(run).rejects.toThrow("session busy");
    expect(client.listenerCount).toBe(0);
  });

  it("interrupts the session and rejects with AbortError on abort", async () => {
    const client = new FakeGatewayClient();
    const controller = new AbortController();
    const run = runPrompt(client, { profile: "default", text: "hi", signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(client.callsTo("session.interrupt")).toEqual([
      { method: "session.interrupt", params: { session_id: "fake1" }, timeoutMs: undefined },
    ]);
    expect(client.listenerCount).toBe(0);
  });

  it("interrupts and rejects with a timeout TurnError past the deadline", async () => {
    const client = new FakeGatewayClient();
    const run = runPrompt(client, { profile: "default", text: "hi", timeoutMs: 5_000 });
    const rejection = expect(run).rejects.toBeInstanceOf(TurnError);
    await vi.advanceTimersByTimeAsync(5_001);
    await rejection;
    await expect(run).rejects.toMatchObject({ status: "timeout" });
    expect(client.callsTo("session.interrupt")).toHaveLength(1);
  });
});
