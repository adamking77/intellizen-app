import { describe, expect, it } from "vitest";

import { formatChatTextAttachment, supportsChatTextFile } from "@/lib/chat-attachments";

describe("Agent Panel text attachments", () => {
  it("accepts text-like MIME types and known text extensions", () => {
    expect(supportsChatTextFile({ name: "brief.md", type: "" })).toBe(true);
    expect(supportsChatTextFile({ name: "evidence.json", type: "application/json" })).toBe(true);
    expect(supportsChatTextFile({ name: "photo.png", type: "image/png" })).toBe(false);
  });

  it("uses a longer fence when the attachment already contains code fences", () => {
    expect(formatChatTextAttachment("notes.md", "before\n```ts\nvalue\n```\nafter")).toContain(
      "````\nbefore\n```ts\nvalue\n```\nafter\n````",
    );
  });
});
