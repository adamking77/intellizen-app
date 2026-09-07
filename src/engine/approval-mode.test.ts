import { describe, expect, it } from "vitest";

import { FakeGatewayClient } from "./test-support";
import { readApprovalMode, saveApprovalMode } from "./approval-mode";

describe("Hermes approval mode", () => {
  it("reads and saves the exact profile-scoped setting, then verifies it", async () => {
    const client = new FakeGatewayClient();
    let mode = "manual";
    client.respondWith((call) => {
      if (call.method === "config.set") { mode = String(call.params.value); return { key: "approvals.mode", value: mode }; }
      if (call.method === "config.get") return { value: mode };
      return undefined;
    });

    await expect(readApprovalMode(client, "fiona", "session-7")).resolves.toBe("manual");
    await expect(saveApprovalMode(client, "fiona", "session-7", "smart")).resolves.toBe("smart");
    expect(client.calls).toEqual([
      { method: "config.get", params: { key: "approvals.mode", profile: "fiona", session_id: "session-7" }, timeoutMs: undefined },
      { method: "config.set", params: { key: "approvals.mode", profile: "fiona", session_id: "session-7", value: "smart" }, timeoutMs: undefined },
      { method: "config.get", params: { key: "approvals.mode", profile: "fiona", session_id: "session-7" }, timeoutMs: undefined },
    ]);
  });

  it("rejects an unknown readback instead of presenting it as an effective mode", async () => {
    const client = new FakeGatewayClient();
    client.respondWith((call) => call.method === "config.get" ? { value: "sometimes" } : undefined);
    await expect(readApprovalMode(client, "fiona", null)).rejects.toThrow("unknown approval mode");
  });
});
