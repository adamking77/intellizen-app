import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SignalCard } from "@/components/signals/signal-card";

describe("SignalCard action contract", () => {
  it("keeps the open action keyboard reachable and secondary actions visible", () => {
    const html = renderToStaticMarkup(createElement(SignalCard, {
      title: "Source title",
      url: "https://example.com/source",
      source: "Example",
      publishedAt: null,
      snippet: null,
      score: null,
      onSave: vi.fn(),
      onDismiss: vi.fn(),
    }));

    expect(html).toContain('aria-label="Open Source title"');
    expect(html).toContain('title="Open URL"');
    expect(html).toContain('title="Save to evidence pile"');
    expect(html).toContain('title="Dismiss"');
    expect(html).toContain("opacity-60");
    expect(html).not.toContain("items-center gap-0.5 opacity-0");
  });
});
