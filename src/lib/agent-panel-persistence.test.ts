// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  appendToAgentPanelDraft,
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

  it("appends voice and file text without manufacturing blank paragraphs", () => {
    expect(appendToAgentPanelDraft("Existing", "Added")).toBe(
      "Existing\n\nAdded",
    );
    expect(appendToAgentPanelDraft("Existing", "   ")).toBe("Existing");
  });
});
