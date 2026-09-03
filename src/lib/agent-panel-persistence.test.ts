// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  appendToAgentPanelDraft,
  entriesToTurns,
  persistAgentPanelHistory,
  readAgentPanelChatHistory,
  readAgentPanelCollapsed,
  requestAgentPanelOpen,
  AGENT_PANEL_OPEN_EVENT,
} from "@/lib/agent-panel-persistence";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("agent panel persistence", () => {
  it("exposes a real panel-open request for other pages", () => {
    let opened = 0;
    const onOpen = () => opened++;
    window.addEventListener(AGENT_PANEL_OPEN_EVENT, onOpen);
    requestAgentPanelOpen();
    window.removeEventListener(AGENT_PANEL_OPEN_EVENT, onOpen);
    expect(opened).toBe(1);
  });

  it("distinguishes explicit collapse from the unset responsive default", () => {
    const storage = memoryStorage();
    expect(readAgentPanelCollapsed(storage)).toBeNull();
    storage.setItem("intelizen:agent-panel-collapsed", "1");
    expect(readAgentPanelCollapsed(storage)).toBe(true);
    storage.setItem("intelizen:agent-panel-collapsed", "0");
    expect(readAgentPanelCollapsed(storage)).toBe(false);
  });

  it("round-trips bounded valid history and rejects corrupt JSON", () => {
    const storage = memoryStorage();
    const entries = Array.from({ length: 45 }, (_, index) => ({
      id: `entry-${index}`,
      message: `message-${index}`,
      targetAgent: "keel",
      status: "submitted" as const,
      detail: "codex-cli",
      createdAt: new Date(index).toISOString(),
    }));
    persistAgentPanelHistory(storage, "chief_engineer", entries);
    expect(readAgentPanelChatHistory(storage, "chief_engineer")).toHaveLength(40);
    storage.setItem(
      "intelizen:agent-panel:history:chief_engineer",
      "{not-json",
    );
    expect(readAgentPanelChatHistory(storage, "chief_engineer")).toEqual([]);
  });

  it("projects request and response rows into chronological turns", () => {
    expect(
      entriesToTurns([
        {
          id: "message-1",
          message: "Inspect it.",
          targetAgent: "keel",
          status: "submitted",
          detail: "codex-cli",
          createdAt: "2026-07-28T10:00:00.000Z",
          reply: "Done.",
          repliedAt: "2026-07-28T10:00:01.000Z",
        },
      ]).map((turn) => [turn.role, turn.text]),
    ).toEqual([
      ["user", "Inspect it."],
      ["agent", "Done."],
    ]);
  });

  it("appends voice and file text without manufacturing blank paragraphs", () => {
    expect(appendToAgentPanelDraft("Existing", "Added")).toBe(
      "Existing\n\nAdded",
    );
    expect(appendToAgentPanelDraft("Existing", "   ")).toBe("Existing");
  });
});
