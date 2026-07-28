import { describe, expect, it } from "vitest";

import {
  buildRuntimeChatPrompt,
  runtimeChatResultFromEvents,
} from "@/services/runtime-chat";

describe("runtime role chat", () => {
  it("bounds visible history and names the durable role separately from its occupant", () => {
    const prompt = buildRuntimeChatPrompt({
      roleName: "Chief Engineer",
      agentName: "Keel",
      history: Array.from({ length: 14 }, (_, index) => ({
        role: index % 2 ? ("assistant" as const) : ("user" as const),
        content: `turn-${index}`,
      })),
      message: "Inspect this.",
    });
    expect(prompt).toContain("Keel");
    expect(prompt).toContain("Chief Engineer");
    expect(prompt).not.toContain("turn-0");
    expect(prompt).toContain("turn-13");
    expect(prompt).toContain("User: Inspect this.");
  });

  it("accepts only an observed completed terminal result", () => {
    expect(
      runtimeChatResultFromEvents([
        { kind: "started", runId: "session-1" },
        { kind: "output", text: "Done." },
        { kind: "usage", inputTokens: 10, outputTokens: 2 },
        { kind: "terminal", reason: "completed", result: "Done." },
      ]),
    ).toEqual({
      sessionId: "session-1",
      text: "Done.",
      usage: { inputTokens: 10, outputTokens: 2 },
      diagnostics: { providerEvents: [] },
    });
    expect(() =>
      runtimeChatResultFromEvents([
        { kind: "terminal", reason: "failed" },
      ]),
    ).toThrow("without a completed result");
  });

  it("surfaces provider protocol and runtime failures instead of a generic terminal error", () => {
    expect(() =>
      runtimeChatResultFromEvents([
        { kind: "protocol_error", message: "Codex emitted malformed JSON." },
      ]),
    ).toThrow("Codex emitted malformed JSON");
    expect(() =>
      runtimeChatResultFromEvents([
        {
          kind: "runtime_error",
          code: "auth_lost",
          message: "Provider authentication expired.",
          resultKnown: false,
          retryable: false,
        },
      ]),
    ).toThrow("auth_lost: Provider authentication expired");
  });

  it("preserves provider events as runtime diagnostics", () => {
    expect(
      runtimeChatResultFromEvents([
        { kind: "provider_event", eventType: "rate_limit_event" },
        { kind: "terminal", reason: "completed", result: "Done." },
      ]).diagnostics.providerEvents,
    ).toEqual(["rate_limit_event"]);
  });
});
