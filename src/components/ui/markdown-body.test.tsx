// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownBody } from "./markdown-body";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => document.body.replaceChildren());

describe("MarkdownBody", () => {
  it("renders an image block without swallowing the surrounding prose", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    await act(async () => root.render(<MarkdownBody content={"Before\n\n![Graph snapshot](data:image/png;base64,AQID)\n\nAfter"} />));
    expect(host.querySelector("img")?.getAttribute("alt")).toBe("Graph snapshot");
    expect(host.textContent).toContain("Before");
    expect(host.textContent).toContain("After");
    await act(async () => root.unmount());
  });
});
