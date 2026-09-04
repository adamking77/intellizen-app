import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setGatewayClient } from "@/engine/gateway";
import type { JsonRpcGatewayClient } from "@/engine/json-rpc-gateway";
import { FakeGatewayClient, loadProfilesList } from "@/engine/test-support";
import { fetchHermesProfiles, submitWorkflow } from "@/services/agent";

const workflow = {
  workflowId: "wf-1",
  task: "Execute Workflow Run run-1",
  context: { type: "workflow_run", id: "run-1", route: "workflow_runs" },
  priority: "normal" as const,
};

describe("submitWorkflow through the gateway", () => {
  let client: FakeGatewayClient;

  beforeEach(() => {
    client = new FakeGatewayClient();
    setGatewayClient(client as unknown as JsonRpcGatewayClient);
  });

  afterEach(() => {
    setGatewayClient(null);
    vi.restoreAllMocks();
  });

  it("opens a session on the default profile and submits without awaiting the turn", async () => {
    client.respondWith((call) =>
      call.method === "profiles.list" ? loadProfilesList().result : undefined,
    );
    const result = await submitWorkflow(workflow);
    expect(result).toEqual({ status: "submitted", messageId: "fake1" });
    expect(client.calls.map((c) => c.method)).toEqual(["profiles.list", "session.create", "prompt.submit"]);
    expect(client.calls[1].params).toEqual({ cols: 96, source: "desktop", profile: "default" });
    const prompt = client.calls[2].params.text as string;
    expect(prompt).toContain("IntelliZen workflow dispatch");
    expect(prompt).toContain('"workflow_id": "wf-1"');
  });

  it("uses the named profile when one is given", async () => {
    await submitWorkflow({ ...workflow, profile: "fiona" });
    expect(client.calls.map((c) => c.method)).toEqual(["session.create", "prompt.submit"]);
    expect(client.calls[0].params.profile).toBe("fiona");
  });

  it("surfaces a gateway refusal instead of dispatching through a second path", async () => {
    client.respondWith((call) => {
      if (call.method === "session.create") throw new Error("gateway not connected");
      return undefined;
    });
    await expect(submitWorkflow({ ...workflow, profile: "fiona" }))
      .rejects.toThrow("gateway not connected");
  });

  it("lists profiles from the gateway", async () => {
    client.respondWith((call) =>
      call.method === "profiles.list" ? loadProfilesList().result : undefined,
    );
    const profiles = await fetchHermesProfiles();
    expect(profiles.map((p) => p.name)).toContain("fiona");
  });
});
