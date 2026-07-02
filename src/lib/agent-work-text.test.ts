import { describe, expect, it } from "vitest";

import {
  appendMarkdownSection,
  formatAgentWorkTimestamp,
  latestBodyField,
  latestMarkdownSection,
  markdownList,
} from "./agent-work-text";

function claimSection(actor: string, role: string) {
  return `## Agent Claim - ${formatAgentWorkTimestamp(new Date("2026-07-02T10:00:00Z"))}

Task: Test task
Durable role: ${role}
Functional lane: Distribution
Current actor: ${actor}
Backup actor: none
Reason for claim: test
Sources checked:
${markdownList(["doc 1600"])}
Approval needed before: publish`;
}

describe("appendMarkdownSection", () => {
  it("starts a body from empty", () => {
    expect(appendMarkdownSection(null, "## A\n\nx")).toBe("## A\n\nx");
    expect(appendMarkdownSection("", "## A\n\nx")).toBe("## A\n\nx");
  });

  it("separates appended sections with a blank line", () => {
    const body = appendMarkdownSection("intro text\n", "## A\n\nx");
    expect(body).toBe("intro text\n\n## A\n\nx");
  });
});

describe("append/parse round trip", () => {
  it("recovers the latest matching section after multiple appends", () => {
    let body: string | null = "Human-authored intro.";
    body = appendMarkdownSection(body, claimSection("Steve/Claude", "Distribution Operator"));
    body = appendMarkdownSection(body, "## Agent Note - 2026-07-02 11:00\n\nActor: Fiona/Hermes\nNote:\nprogress");
    body = appendMarkdownSection(body, claimSection("Keel/Codex", "Implementation Operator"));

    const latestClaim = latestMarkdownSection(body, ["Agent Claim"]);
    expect(latestClaim).toContain("Keel/Codex");
    expect(latestClaim).not.toContain("Steve/Claude");

    const latestNote = latestMarkdownSection(body, ["Agent Note", "Agent Claim"]);
    expect(latestNote).toContain("Keel/Codex");
  });

  it("latestBodyField returns the last non-none value across sections", () => {
    let body: string | null = null;
    body = appendMarkdownSection(body, claimSection("Steve/Claude", "Distribution Operator"));
    body = appendMarkdownSection(body, claimSection("Keel/Codex", "Implementation Operator"));

    expect(latestBodyField(body, ["Durable role"])).toBe("Implementation Operator");
    expect(latestBodyField(body, ["Current actor", "Actor"])).toBe("Keel/Codex");
    expect(latestBodyField(body, ["Backup actor"])).toBeNull();
    expect(latestBodyField(body, ["Approval needed before", "Approval needed"])).toBe("publish");
  });

  it("does not match a heading in the middle of a line", () => {
    const body = "prose mentioning ## Agent Claim inline\n\n## Agent Receipt - now\n\nOutcome: done";
    expect(latestMarkdownSection(body, ["Agent Claim"])).toBeNull();
    expect(latestMarkdownSection(body, ["Agent Receipt"])).toContain("Outcome: done");
  });

  it("caps extracted sections at 900 characters", () => {
    const long = `## Agent Receipt - now\n\n${"x".repeat(2000)}`;
    expect(latestMarkdownSection(long, ["Agent Receipt"])?.length).toBe(900);
  });
});

describe("markdownList", () => {
  it("renders none for empty input and bullets otherwise", () => {
    expect(markdownList()).toBe("none");
    expect(markdownList([])).toBe("none");
    expect(markdownList(["a", "b"])).toBe("- a\n- b");
  });
});
