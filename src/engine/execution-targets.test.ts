import { describe, expect, it } from "vitest";

import type { AcpAgent } from "./acp-registry";
import { executionTargets } from "./execution-targets";
import type { HermesProfile } from "./profiles";

describe("execution targets", () => {
  it("maps Hermes profiles and ACP agents onto the two supported doors", () => {
    const profile = {
      name: "fiona",
      displayName: "Fiona",
      description: "",
      model: "m1",
      provider: "openrouter",
      isDefault: true,
      gatewayRunning: true,
    } satisfies HermesProfile;
    const agent = {
      id: "keel",
      name: "Keel",
      engine: "codex",
      command: "codex-acp",
      args: [],
      model: "m2",
    } satisfies AcpAgent;

    expect(executionTargets([profile], [agent])).toEqual([
      { ref: "hermes:fiona", agentKey: "fiona", kind: "hermes", targetId: "fiona", model: "m1", execution: "durable" },
      { ref: "acp:keel", agentKey: "keel", kind: "acp", targetId: "keel", model: "m2", execution: "ephemeral" },
    ]);
  });
});
