import { describe, expect, it } from "vitest";
import cancelledTrace from "@/fixtures/runtime-traces/cancelled.jsonl?raw";
import duplicateResultTrace from "@/fixtures/runtime-traces/duplicate-result.jsonl?raw";
import malformedTrace from "@/fixtures/runtime-traces/malformed.jsonl?raw";
import normalTrace from "@/fixtures/runtime-traces/normal.jsonl?raw";
import secretOutputTrace from "@/fixtures/runtime-traces/secret-output.jsonl?raw";
import slowOutputTrace from "@/fixtures/runtime-traces/slow-output.jsonl?raw";
import timeoutTrace from "@/fixtures/runtime-traces/timeout.jsonl?raw";
import authFailureTrace from "@/fixtures/runtime-traces/auth-failure.jsonl?raw";
import parentLossTrace from "@/fixtures/runtime-traces/parent-loss.jsonl?raw";
import orphanedChildTrace from "@/fixtures/runtime-traces/orphaned-child.jsonl?raw";
import resumeUnsupportedTrace from "@/fixtures/runtime-traces/resume-unsupported.jsonl?raw";
import ambiguousDeliveryTrace from "@/fixtures/runtime-traces/ambiguous-delivery.jsonl?raw";
import codexNormalTrace from "@/fixtures/runtime-traces/codex-0.145.0-normal.jsonl?raw";
import claudeNormalTrace from "@/fixtures/runtime-traces/claude-2.1.220-normal.jsonl?raw";
import {
  assertClaudeCliVersion,
  assertClaudeWorkerIsolation,
  assertCodexCliVersion,
  claudeExecArgs,
  claudeRuntimeAdapter,
  codexExecArgs,
  codexRuntimeAdapter,
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
  "auth-failure": authFailureTrace,
  "parent-loss": parentLossTrace,
  "orphaned-child": orphanedChildTrace,
  "resume-unsupported": resumeUnsupportedTrace,
  "ambiguous-delivery": ambiguousDeliveryTrace,
  "codex-normal": codexNormalTrace,
  "claude-normal": claudeNormalTrace,
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

  it.each([
    ["auth-failure", "auth_lost"],
    ["parent-loss", "parent_lost"],
    ["orphaned-child", "orphaned_child"],
    ["resume-unsupported", "resume_unsupported"],
    ["ambiguous-delivery", "ambiguous_delivery"],
  ] as const)("normalizes deferred Gate 5 trace %s truthfully", (name, code) => {
    const events = mockRuntimeAdapter.normalize(trace(name));
    expect(events[events.length - 1]).toMatchObject({
      kind: "runtime_error",
      code,
      resultKnown: false,
      retryable: false,
    });
  });

  it("marks ambiguous delivery as non-retryable", () => {
    const events = mockRuntimeAdapter.normalize(trace("ambiguous-delivery"));
    expect(events[events.length - 1]).toEqual({
      kind: "runtime_error",
      code: "ambiguous_delivery",
      message: "Runtime delivery may have occurred, but no result can be confirmed.",
      resultKnown: false,
      retryable: false,
    });
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

describe("Codex 0.145.0 adapter contract", () => {
  it("pins the exact installed version", () => {
    expect(() => assertCodexCliVersion("codex-cli 0.145.0")).not.toThrow();
    expect(() => assertCodexCliVersion("codex-cli 0.146.0")).toThrow(
      "Unsupported Codex CLI version",
    );
  });

  it("builds the reviewed stdin and sandbox invocation", () => {
    expect(codexExecArgs("/tmp/assignment")).toEqual([
      "exec",
      "--strict-config",
      "--json",
      "--ephemeral",
      "--ignore-rules",
      "--sandbox",
      "workspace-write",
      "-c",
      'approval_policy="never"',
      "-C",
      "/tmp/assignment",
      "-",
    ]);
  });

  it("normalizes observed JSONL and measured usage", () => {
    expect(codexRuntimeAdapter.normalize(trace("codex-normal"))).toEqual([
      { kind: "started", runId: "019fa-runtime-fixture" },
      { kind: "output", text: "GATE3_OK" },
      { kind: "usage", inputTokens: 21028, outputTokens: 8 },
      { kind: "terminal", reason: "completed", result: "GATE3_OK" },
    ]);
  });

  it("fails the turn when Codex reports a failed item", () => {
    const events = codexRuntimeAdapter.normalize([
      '{"type":"thread.started","thread_id":"failed-run"}',
      '{"type":"item.completed","item":{"type":"error","message":"provider failed"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":0}}',
    ]);
    expect(events).toContainEqual({
      kind: "protocol_error",
      message: "Codex reported a failed item.",
    });
    expect(events[events.length - 1]).toEqual({
      kind: "terminal",
      reason: "failed",
    });
  });

  it("never marks secret-rejected output completed", () => {
    const canary = "api_key=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890";
    const events = codexRuntimeAdapter.normalize([
      '{"type":"thread.started","thread_id":"secret-run"}',
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: canary },
      }),
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
    ]);
    expect(events[events.length - 1]).toEqual({
      kind: "terminal",
      reason: "failed",
    });
    expect(JSON.stringify(events)).not.toContain(canary);
  });
});

describe("Claude 2.1.220 adapter contract", () => {
  it("pins the exact installed version", () => {
    expect(() => assertClaudeCliVersion("2.1.220 (Claude Code)")).not.toThrow();
    expect(() => assertClaudeCliVersion("2.1.221 (Claude Code)")).toThrow(
      "Unsupported Claude CLI version",
    );
  });

  it("builds the strict worker-only stdin invocation", () => {
    expect(claudeExecArgs("/tmp/worker.json")).toEqual([
      "--safe-mode",
      "--mcp-config",
      "/tmp/worker.json",
      "--strict-mcp-config",
      "--tools",
      expect.stringContaining("mcp__intelizen-worker__list_roles"),
      "--allowedTools",
      expect.stringContaining("mcp__intelizen-worker__list_roles"),
      "--permission-mode",
      "dontAsk",
      "--no-session-persistence",
      "--verbose",
      "--include-partial-messages",
      "--output-format",
      "stream-json",
      "-p",
    ]);
  });

  it("normalizes deltas without duplicating the assembled assistant message", () => {
    const events = claudeRuntimeAdapter.normalize(trace("claude-normal"));
    expect(events.filter((event) => event.kind === "output")).toEqual([
      { kind: "output", text: "GATE6_OK" },
    ]);
    expect(events).toContainEqual({
      kind: "terminal",
      reason: "completed",
      result: "GATE6_OK",
    });
    expect(claudeRuntimeAdapter.deriveCapabilities(events)).toEqual({
      structuredOutput: true,
      streaming: true,
      cancellation: true,
      timeout: true,
      usage: true,
      resume: false,
    });
  });

  it("accepts isolation only from the exact system/init readback", () => {
    const events = claudeRuntimeAdapter.normalize(trace("claude-normal"));
    expect(assertClaudeWorkerIsolation(events).mcpServers).toEqual([
      "intelizen-worker",
    ]);
    expect(() =>
      assertClaudeWorkerIsolation(
        events.map((event) =>
          event.kind === "initialized"
            ? { ...event, mcpServers: ["intelizen-worker", "supabase"] }
            : event,
        ),
      ),
    ).toThrow("expected only intelizen-worker");
  });
});
