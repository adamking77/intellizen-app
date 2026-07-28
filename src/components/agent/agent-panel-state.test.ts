import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AgentPanelState,
  type AgentPanelAvailability,
  type AgentPanelDisplayMode,
} from "@/components/agent/agent-panel-state";

function render(mode: AgentPanelDisplayMode, state: AgentPanelAvailability) {
  return renderToStaticMarkup(
    createElement(AgentPanelState, {
      mode,
      state,
      detail: state === "unavailable" ? "No active occupant" : null,
    }),
  );
}

describe("AgentPanelState", () => {
  it.each(["collapsed", "docked", "standalone"] as const)(
    "renders the %s panel mode explicitly",
    (mode) => {
      expect(render(mode, "ready")).toContain(`data-panel-mode="${mode}"`);
    },
  );

  it.each([
    ["loading", "Checking role"],
    ["ready", "Ready"],
    ["unavailable", "No active occupant"],
    ["empty", "No conversation yet"],
    ["error", "Conversation unavailable"],
  ] as const)("renders %s as a distinct state", (state, copy) => {
    const markup = render("docked", state);
    expect(markup).toContain(`data-panel-state="${state}"`);
    expect(markup).toContain(copy);
  });
});
