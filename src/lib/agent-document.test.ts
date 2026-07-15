import { describe, expect, it } from "vitest";

import { buildAgentReplyDocumentDraft } from "@/lib/agent-document";

describe("agent reply document draft", () => {
  it("creates a useful title and preserves the exchange context", () => {
    const draft = buildAgentReplyDocumentDraft({
      request: "Please **review** the proposal and tell me what needs changing.",
      reply: "The scope is sound. Tighten the second milestone.",
      agentName: "Fiona",
      ventureLabel: "GenZen Solutions",
      routeLabel: "Docs / Proposal",
      occurredAt: new Date("2026-07-15T09:30:00.000Z"),
    });

    expect(draft.title).toBe("Fiona — Please review the proposal and tell me what needs changing.");
    expect(draft.body).toContain("Venture: GenZen Solutions");
    expect(draft.body).toContain("Route: Docs / Proposal");
    expect(draft.body).toContain("## Request");
    expect(draft.body).toContain("## Fiona’s reply");
    expect(draft.body).toContain("Tighten the second milestone.");
  });
});
