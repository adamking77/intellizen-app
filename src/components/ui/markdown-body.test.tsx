// @vitest-environment happy-dom

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

it("renders tables and safe inline markup while leaving code and raw HTML literal", () => {
  const html = renderToStaticMarkup(<MarkdownBody content={'**Evidence** and [source](https://example.com).\n\n| Field | Value |\n|---|---|\n| Name | `Keel` |\n\n```text\n**literal**\n```\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\nworkflow_run_id / chief_engineer / 0 7 * * *'} />);
  expect(html).toContain('<strong>Evidence</strong>');
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('<table'); expect(html).toContain('<td');
  expect(html).toContain('<code>**literal**</code>');
  expect(html).toContain('workflow_run_id / chief_engineer / 0 7 * * *');
  expect(html).not.toContain('<script>'); expect(html).not.toContain('href="javascript:');
});
