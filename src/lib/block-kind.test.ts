import { describe, expect, it } from "vitest";

import { blockReason } from "./block-kind";

describe("blockReason", () => {
  it("reserves the person-needed signal for needs_input", () => {
    expect(blockReason("needs_input")).toEqual({ word: "waiting on you", needsYou: true });
    expect(blockReason("transient")).toEqual({ word: "failed, will retry", needsYou: false });
    expect(blockReason("dependency")).toEqual({ word: "waiting on another task", needsYou: false });
  });

  it("keeps an empty kind unknown and exposes future kinds as words", () => {
    expect(blockReason("")).toBeNull();
    expect(blockReason("policy_gate")).toEqual({ word: "policy gate", needsYou: false });
  });
});
