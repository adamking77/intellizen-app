import { describe, expect, it } from "vitest";

import { highlightLines } from "./highlight";

describe("project file highlighting", () => {
  it("preserves source while marking useful TypeScript tokens", () => {
    const source = "const answer = 42; // checked\nreturn answer;";
    const lines = highlightLines(source, "ts");
    expect(lines.map((line) => line.map((token) => token.text).join("")).join("\n")).toBe(source);
    expect(lines.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "keyword", text: "const" }),
      expect.objectContaining({ kind: "number", text: "42" }),
      expect.objectContaining({ kind: "comment", text: "// checked" }),
    ]));
  });

  it("keeps block comments highlighted across lines", () => {
    const lines = highlightLines("/* one\n two */\nconst x = 1;", "ts");
    expect(lines[1][0]).toEqual({ kind: "comment", text: " two */" });
  });
});
