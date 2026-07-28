// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { writeTextToClipboard } from "@/lib/clipboard";

describe("writeTextToClipboard", () => {
  it("uses the async clipboard API when it is available", async () => {
    const writeText = vi.fn(async () => undefined);

    await writeTextToClipboard("bounded evidence", { writeText });

    expect(writeText).toHaveBeenCalledWith("bounded evidence");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to a temporary textarea and always removes it", async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await writeTextToClipboard("local receipt", null);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("removes the fallback textarea when clipboard access is denied", async () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });

    await expect(
      writeTextToClipboard("unsafe implicit copy", null),
    ).rejects.toThrow("Clipboard access was denied.");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
