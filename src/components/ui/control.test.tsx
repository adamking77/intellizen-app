import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Control } from "./control";

describe("Control", () => {
  it("renders the closed variants", () => {
    for (const variant of ["default", "selected", "primary", "quiet", "danger"] as const) {
      const html = renderToStaticMarkup(createElement(Control, { variant }, variant));
      expect(html).toContain("--h-ctl");
      expect(html).toContain("--r-ctl");
    }
  });

  it("disables and labels the loading state", () => {
    const html = renderToStaticMarkup(createElement(Control, { loading: true }, "Save"));
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("control-running-dot");
  });
});
