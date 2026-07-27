import { describe, expect, it } from "vitest";

import { previewAgentMessageDocument } from "@/services/agent-message-document";

describe("Agent Panel save-to-document preview", () => {
  it("builds a bounded explicit preview with provenance", () => {
    expect(
      previewAgentMessageDocument({
        text: "# Gate finding\n\nEvidence follows.",
        roleKey: "verifier",
        agentKey: "fable",
        createdAt: "2026-07-27T12:00:00.000Z",
      }),
    ).toMatchObject({
      dryRun: true,
      writePerformed: false,
      title: "Gate finding",
      sourcePath: "agent-panel/verifier/2026-07-27-gate-finding.md",
      roleKey: "verifier",
      agentKey: "fable",
    });
  });
});
