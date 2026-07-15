import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QueryState } from "@/components/ui/query-state";

describe("QueryState", () => {
  it("shows an error and retry before loading or content", () => {
    const html = renderToStaticMarkup(createElement(
      QueryState,
      {
        isLoading: true,
        error: new Error("Connection lost"),
        isEmpty: false,
        onRetry: () => undefined,
        children: createElement("div", null, "Loaded content"),
      },
    ));

    expect(html).toContain("Connection lost");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Loaded content");
  });

  it("keeps a valid empty result distinct from loaded content", () => {
    const html = renderToStaticMarkup(createElement(
      QueryState,
      {
        isLoading: false,
        isEmpty: true,
        emptyTitle: "No signals",
        children: createElement("div", null, "Loaded content"),
      },
    ));

    expect(html).toContain("No signals");
    expect(html).not.toContain("Loaded content");
  });
});
