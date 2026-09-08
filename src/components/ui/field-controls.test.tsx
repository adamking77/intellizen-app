import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Input } from "./input";
import { Select } from "./select";
import { Textarea } from "./textarea";

describe("field controls", () => {
  it.each([
    ["input", createElement(Input, { "aria-label": "Name" })],
    ["select", createElement(Select, { "aria-label": "Mode" }, createElement("option", null, "Thinking"))],
    ["textarea", createElement(Textarea, { "aria-label": "Notes" })],
  ])("renders %s as a single-line transparent field with an accent focus edge", (_name, field) => {
    const html = renderToStaticMarkup(field);
    expect(html).toContain("border-b");
    expect(html).toContain("border-[var(--surface-line)]");
    expect(html).toContain("bg-transparent");
    expect(html).toContain("focus-visible:border-[var(--accent)]");
  });

  it("keeps the select native control and custom chevron contract", () => {
    const html = renderToStaticMarkup(
      createElement(Select, { "aria-label": "Mode" }, createElement("option", { value: "thinking" }, "Thinking")),
    );
    expect(html).toContain("<select");
    expect(html).toContain('data-select-chevron="custom"');
    expect(html).toContain("appearance-none");
    expect(html).toContain("Thinking");
  });
});
