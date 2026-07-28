import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AgentPanelState,
  type AgentPanelAvailability,
} from "@/components/agent/agent-panel-state";
import { AgentPanelShell } from "@/components/agent/agent-panel-shell";

describe("Agent Panel component states", () => {
  it.each([
    "loading",
    "ready",
    "working",
    "blocked",
    "unavailable",
    "offline",
    "empty",
    "error",
  ] satisfies AgentPanelAvailability[])(
    "renders the %s availability contract",
    (state) => {
      const html = renderToStaticMarkup(
        createElement(AgentPanelState, {
          mode: "docked",
          state,
          detail: "Observed detail",
        }),
      );
      expect(html).toContain(`data-panel-state="${state}"`);
      expect(html).toContain('data-panel-mode="docked"');
      expect(html).toContain("Observed detail");
    },
  );

  it("renders a compact collapsed state with an accessible label", () => {
    const html = renderToStaticMarkup(
      createElement(AgentPanelState, {
        mode: "collapsed",
        state: "unavailable",
        detail: "No reviewed binding",
      }),
    );
    expect(html).toContain('data-panel-mode="collapsed"');
    expect(html).toContain(
      'aria-label="Unavailable: No reviewed binding"',
    );
  });

  it.each([
    { standalone: false, expectedSeparator: true },
    { standalone: true, expectedSeparator: false },
  ])(
    "renders the docked/standalone shell contract",
    ({ standalone, expectedSeparator }) => {
      const html = renderToStaticMarkup(
        createElement(
          AgentPanelShell,
          {
            standalone,
            width: 336,
            onResizeStart: () => undefined,
            onInteraction: () => undefined,
          },
          "Thread",
        ),
      );
      expect(html.includes('role="separator"')).toBe(expectedSeparator);
      expect(html).toContain("Thread");
    },
  );
});
