// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { ReplyMarkdown } from "@/components/agent/reply-markdown";

async function render(content: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<ReplyMarkdown content={content} />));
  return { container, unmount: async () => act(async () => root.unmount()) };
}

describe("ReplyMarkdown", () => {
  it("renders inline code, strong, emphasis and links without their marks", async () => {
    const { container, unmount } = await render(
      "`Wed Sep 2 14:07:34 +04 2026` — that's the **local** output, *really*, see [docs](https://example.com).",
    );
    expect(container.querySelector("code")?.textContent).toBe("Wed Sep 2 14:07:34 +04 2026");
    expect(container.querySelector("strong")?.textContent).toBe("local");
    expect(container.querySelector("em")?.textContent).toBe("really");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.textContent).not.toMatch(/[`*]/);
    await unmount();
  });

  it("keeps fenced code, lists and paragraphs as blocks", async () => {
    const { container, unmount } = await render("Intro `x`\n\n- one `a`\n- two\n\n```\nraw *stays*\n```\n\n1. first\n2. second");
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.querySelector("pre code")?.textContent).toBe("raw *stays*");
    expect(container.querySelectorAll("li code")).toHaveLength(1);
    await unmount();
  });
});
