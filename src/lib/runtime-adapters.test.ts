import { describe, expect, it } from "vitest";
import cancelledTrace from "@/fixtures/runtime-traces/cancelled.jsonl?raw";
import duplicateResultTrace from "@/fixtures/runtime-traces/duplicate-result.jsonl?raw";
import malformedTrace from "@/fixtures/runtime-traces/malformed.jsonl?raw";
import normalTrace from "@/fixtures/runtime-traces/normal.jsonl?raw";
import secretOutputTrace from "@/fixtures/runtime-traces/secret-output.jsonl?raw";
import slowOutputTrace from "@/fixtures/runtime-traces/slow-output.jsonl?raw";
import timeoutTrace from "@/fixtures/runtime-traces/timeout.jsonl?raw";
import {
  getRuntimeAdapter,
  mockRuntimeAdapter,
  type NormalizedRuntimeEvent,
} from "@/lib/runtime-adapters";

const traces = {
  cancelled: cancelledTrace,
  "duplicate-result": duplicateResultTrace,
  malformed: malformedTrace,
  normal: normalTrace,
  "secret-output": secretOutputTrace,
  "slow-output": slowOutputTrace,
  timeout: timeoutTrace,
};

function trace(name: keyof typeof traces) {
  return traces[name].trim().split("\n");
}

function serialized(events: NormalizedRuntimeEvent[]) {
  return JSON.stringify(events);
}

describe("mock runtime adapter golden traces", () => {
  it("normalizes a successful streamed completion and measured usage", async () => {
    const events = mockRuntimeAdapter.normalize(trace("normal"));
    expect(events).toEqual([
      { kind: "started", runId: "run-normal" },
      { kind: "output", text: "Draft " },
      { kind: "output", text: "complete." },
      { kind: "usage", inputTokens: 12, outputTokens: 4 },
      { kind: "terminal", reason: "completed", result: "Draft complete." },
    ]);
  });

  it("preserves ordered slow output without inventing timing", async () => {
    const events = mockRuntimeAdapter.normalize(trace("slow-output"));
    expect(
      events
        .filter((event) => event.kind === "output")
        .map((event) => event.text),
    ).toEqual(["one", "two", "three"]);
  });

  it("degrades malformed events without dropping later valid output", async () => {
    const events = mockRuntimeAdapter.normalize(trace("malformed"));
    expect(events[1]).toEqual({
      kind: "protocol_error",
      message: "Runtime emitted malformed JSON.",
    });
    expect(events[events.length - 1]).toEqual({
      kind: "terminal",
      reason: "completed",
      result: "Recovered.",
    });
  });

  it.each([
    ["cancelled", "cancelled"],
    ["timeout", "timed_out"],
  ] as const)("normalizes %s terminal truthfully", async (name, reason) => {
    const events = mockRuntimeAdapter.normalize(trace(name));
    expect(events[events.length - 1]).toEqual({ kind: "terminal", reason });
  });

  it("accepts only the first result and reports a duplicate terminal", async () => {
    const events = mockRuntimeAdapter.normalize(trace("duplicate-result"));
    expect(events).toContainEqual({
      kind: "terminal",
      reason: "completed",
      result: "first",
    });
    expect(events[events.length - 1]).toEqual({
      kind: "protocol_error",
      message: "Runtime emitted more than one terminal event.",
    });
  });

  it("rejects secret-shaped output without repeating it", async () => {
    const lines = trace("secret-output");
    const canary = JSON.parse(lines[1]).text as string;
    const events = mockRuntimeAdapter.normalize(lines);
    expect(events).toContainEqual({
      kind: "persistence_rejected",
      message: "Runtime output was rejected by the persistence safety gate.",
    });
    expect(serialized(events)).not.toContain(canary);
  });

  it("derives capability flags from trace evidence alone", async () => {
    const names: (keyof typeof traces)[] = [
      "normal",
      "cancelled",
      "timeout",
    ];
    const events = names.flatMap((name) => mockRuntimeAdapter.normalize(trace(name)));
    expect(mockRuntimeAdapter.deriveCapabilities(events)).toEqual({
      structuredOutput: true,
      streaming: true,
      cancellation: true,
      timeout: true,
      usage: true,
      resume: false,
    });
  });

  it("fails closed for an unregistered adapter", () => {
    expect(() => getRuntimeAdapter("unknown")).toThrow(
      "Unsupported runtime adapter: unknown.",
    );
  });
});
