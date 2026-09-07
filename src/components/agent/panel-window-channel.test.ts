// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const channel = vi.hoisted(() => ({
  emitted: [] as Array<{ name: string; payload: unknown }>,
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async (name: string, payload: unknown) => { channel.emitted.push({ name, payload }); }),
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    const handlers = channel.handlers.get(name) ?? new Set();
    handlers.add(handler);
    channel.handlers.set(name, handlers);
    return () => handlers.delete(handler);
  }),
}));

describe("detached panel decision receipts", () => {
  beforeEach(() => {
    channel.emitted = [];
    channel.handlers.clear();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: { metadata: { currentWindow: { label: "agent-panel" } } } });
    vi.resetModules();
  });

  it("settles a decision only after the matching main-window result", async () => {
    const panel = await import("./panel-window");
    const action = {
      type: "approve" as const,
      profile: "acp:wave",
      decision: { kind: "approval" as const, requestId: "approval-1", command: "write", description: "Write output", choices: ["once" as const], messageId: "m1", at: 1 },
      choice: "once" as const,
    };
    const pending = panel.requestAction(action);
    await Promise.resolve();
    const sent = channel.emitted.find((event) => event.name === "agent-panel:action")?.payload as typeof action & { receiptId: string };

    expect(sent.receiptId).toMatch(/^approval-1:[0-9a-f-]{36}$/i);
    expect(channel.handlers.get("agent-panel:action-result")?.size).toBe(1);
    channel.handlers.get("agent-panel:action-result")?.forEach((handler) => handler({ payload: { receiptId: sent.receiptId } }));

    await expect(pending).resolves.toBeUndefined();
    expect(channel.handlers.get("agent-panel:action-result")?.size).toBe(0);
  });

  it("releases the listener and reports an unconfirmed result after the bound", async () => {
    vi.useFakeTimers();
    try {
      const panel = await import("./panel-window");
      const pending = panel.requestAction({
        type: "room-approve",
        roomId: "room-1",
        memberKey: "keel",
        requestId: "approval-2",
        choice: "deny",
      });
      const rejected = expect(pending).rejects.toThrow("could not be confirmed");
      await vi.advanceTimersByTimeAsync(15_000);
      await rejected;
      expect(channel.handlers.get("agent-panel:action-result")?.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a verified approval setting from the main owner", async () => {
    const panel = await import("./panel-window");
    const pending = panel.requestRemoteApprovalMode("fiona", "session-1", "smart");
    await Promise.resolve();
    const sent = channel.emitted.find((event) => event.name === "agent-panel:action")?.payload as { receiptId: string };
    channel.handlers.get("agent-panel:action-result")?.forEach((handler) => handler({ payload: { receiptId: sent.receiptId, approvalMode: "smart" } }));
    await expect(pending).resolves.toBe("smart");
  });

  it("correlates a detached document decision with the main-owned result", async () => {
    const panel = await import("./panel-window");
    const pending = panel.requestAction({
      type: "document-proposal",
      decision: { documentId: "doc-1", docPath: "vault:journal/one.md", proposalId: "proposal-1", taken: [], dropped: [{ id: 0, at: 1, old: ["before"], new: ["after"] }] },
    });
    await Promise.resolve();
    const sent = channel.emitted.find((event) => event.name === "agent-panel:action")?.payload as { receiptId: string };
    expect(sent.receiptId).toMatch(/^doc-1:proposal-1:[0-9a-f-]{36}$/i);
    channel.handlers.get("agent-panel:action-result")?.forEach((handler) => handler({ payload: { receiptId: sent.receiptId } }));
    await expect(pending).resolves.toBeUndefined();
  });
});
