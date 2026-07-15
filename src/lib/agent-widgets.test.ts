import { describe, expect, it } from "vitest";

import {
  AGENT_WIDGET_CONTRACT_VERSION,
  extractGenuiBlocks,
  parseAgentChatResult,
  parseAgentChatWidget,
  parseAgentChatWidgetResult,
} from "@/lib/agent-widgets";

const barWidget = {
  version: 1,
  kind: "data-chart",
  title: "Pipeline",
  chart: {
    type: "bar",
    xKey: "stage",
    series: [
      { key: "open", label: "Open" },
      { key: "done", label: "Done" },
    ],
    data: [
      { stage: "Review", open: 3, done: 1 },
      { stage: "Final", open: 1, done: 4 },
    ],
  },
};

describe("agent widget contract", () => {
  it("parses a versioned multi-series chart", () => {
    const result = parseAgentChatWidgetResult(barWidget);

    expect(result.ok).toBe(true);
    if (!result.ok || result.widget.kind !== "data-chart") return;
    expect(result.widget.version).toBe(AGENT_WIDGET_CONTRACT_VERSION);
    expect(result.widget.chart.series.map((series) => series.key)).toEqual(["open", "done"]);
  });

  it("normalizes unversioned legacy widgets to version 1", () => {
    const legacy = parseAgentChatWidget({
      kind: "data-insights",
      insights: ["Receipt is current."],
    });

    expect(legacy).toMatchObject({
      version: AGENT_WIDGET_CONTRACT_VERSION,
      kind: "data-insights",
    });
  });

  it("rejects unsupported contract versions with a readable reason", () => {
    const result = parseAgentChatWidgetResult({
      version: 2,
      kind: "data-insights",
      insights: ["Future payload"],
    });

    expect(result).toEqual({
      ok: false,
      code: "unsupported-version",
      message: "Widget contract version 2 is not supported.",
    });
  });

  it("preserves readable text when widget JSON is malformed", () => {
    const result = extractGenuiBlocks("Before\n```genui\n{ nope\n```\nAfter");

    expect(result.widgets).toEqual([]);
    expect(result.text).toContain("Before");
    expect(result.text).toContain("Widget unavailable: Widget JSON was malformed.");
    expect(result.text).toContain("After");
  });

  it("reports area charts as explicitly unsupported", () => {
    const result = extractGenuiBlocks([
      "Chart follows.",
      "```genui",
      JSON.stringify({
        ...barWidget,
        chart: { ...barWidget.chart, type: "area" },
      }),
      "```",
    ].join("\n"));

    expect(result.widgets).toEqual([]);
    expect(result.text).toContain("Area charts are not supported. Use a bar or line chart.");
  });

  it("extracts multiple widgets from one assistant turn", () => {
    const result = extractGenuiBlocks([
      "Two views.",
      "```genui",
      JSON.stringify(barWidget),
      "```",
      "```genui",
      JSON.stringify({ version: 1, kind: "data-insights", insights: ["One", "Two"] }),
      "```",
    ].join("\n"));

    expect(result.text).toBe("Two views.");
    expect(result.widgets.map((widget) => widget.kind)).toEqual(["data-chart", "data-insights"]);
  });

  it("keeps all valid result widgets and appends warnings for invalid ones", () => {
    const result = parseAgentChatResult({
      reply: "Here are the results.",
      widgets: [
        barWidget,
        { version: 1, kind: "data-insights", insights: ["Ready"] },
        { version: 9, kind: "data-insights", insights: ["Future"] },
      ],
    });

    expect(result.widgets.map((widget) => widget.kind)).toEqual(["data-chart", "data-insights"]);
    expect(result.widget).toBe(result.widgets[0]);
    expect(result.reply).toContain("Here are the results.");
    expect(result.reply).toContain("Widget unavailable: Widget contract version 9 is not supported.");
  });
});
