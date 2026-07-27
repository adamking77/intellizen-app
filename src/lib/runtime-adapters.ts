import { assertPersistenceSafe } from "../../shared/persistence-redaction.mjs";

export type RuntimeTerminalReason =
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type NormalizedRuntimeEvent =
  | { kind: "started"; runId: string }
  | { kind: "output"; text: string }
  | { kind: "usage"; inputTokens: number; outputTokens: number }
  | { kind: "protocol_error"; message: string }
  | { kind: "persistence_rejected"; message: string }
  | { kind: "terminal"; reason: RuntimeTerminalReason; result?: string };

export type RuntimeCapabilities = {
  structuredOutput: boolean;
  streaming: boolean;
  cancellation: boolean;
  timeout: boolean;
  usage: boolean;
  resume: boolean;
};

export type RuntimeAdapter = {
  id: string;
  normalize(lines: string[]): NormalizedRuntimeEvent[];
  deriveCapabilities(events: NormalizedRuntimeEvent[]): RuntimeCapabilities;
};

type MockWireEvent =
  | { type: "run.started"; runId: string }
  | { type: "output.delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "run.completed"; result: string }
  | { type: "run.failed"; message: string }
  | { type: "run.cancelled" }
  | { type: "run.timed_out" };

function protocolError(message: string): NormalizedRuntimeEvent {
  return { kind: "protocol_error", message };
}

function safeText(value: unknown, label: string): string | null {
  if (typeof value !== "string") return null;
  try {
    assertPersistenceSafe({ [label]: value });
    return value;
  } catch {
    return null;
  }
}

function normalizeMock(lines: string[]): NormalizedRuntimeEvent[] {
  const events: NormalizedRuntimeEvent[] = [];
  let terminalSeen = false;

  for (const line of lines) {
    let wire: MockWireEvent;
    try {
      wire = JSON.parse(line) as MockWireEvent;
    } catch {
      events.push(protocolError("Runtime emitted malformed JSON."));
      continue;
    }

    if (!wire || typeof wire !== "object" || typeof wire.type !== "string") {
      events.push(protocolError("Runtime event is missing a type."));
      continue;
    }

    if (wire.type === "run.started") {
      if (typeof wire.runId !== "string" || !wire.runId) {
        events.push(protocolError("Runtime start event is missing runId."));
      } else {
        events.push({ kind: "started", runId: wire.runId });
      }
      continue;
    }

    if (wire.type === "output.delta") {
      const text = safeText(wire.text, "runtimeOutput");
      events.push(
        text === null
          ? {
              kind: "persistence_rejected",
              message: "Runtime output was rejected by the persistence safety gate.",
            }
          : { kind: "output", text },
      );
      continue;
    }

    if (wire.type === "usage") {
      if (
        !Number.isSafeInteger(wire.inputTokens) ||
        wire.inputTokens < 0 ||
        !Number.isSafeInteger(wire.outputTokens) ||
        wire.outputTokens < 0
      ) {
        events.push(protocolError("Runtime usage event is invalid."));
      } else {
        events.push({
          kind: "usage",
          inputTokens: wire.inputTokens,
          outputTokens: wire.outputTokens,
        });
      }
      continue;
    }

    if (
      wire.type === "run.completed" ||
      wire.type === "run.failed" ||
      wire.type === "run.cancelled" ||
      wire.type === "run.timed_out"
    ) {
      if (terminalSeen) {
        events.push(protocolError("Runtime emitted more than one terminal event."));
        continue;
      }
      terminalSeen = true;

      if (wire.type === "run.completed") {
        const result = safeText(wire.result, "runtimeResult");
        events.push(
          result === null
            ? {
                kind: "persistence_rejected",
                message: "Runtime result was rejected by the persistence safety gate.",
              }
            : { kind: "terminal", reason: "completed", result },
        );
      } else if (wire.type === "run.failed") {
        const message = safeText(wire.message, "runtimeError");
        events.push(
          message === null
            ? {
                kind: "persistence_rejected",
                message: "Runtime error was rejected by the persistence safety gate.",
              }
            : { kind: "terminal", reason: "failed", result: message },
        );
      } else {
        events.push({
          kind: "terminal",
          reason: wire.type === "run.cancelled" ? "cancelled" : "timed_out",
        });
      }
      continue;
    }

    events.push(protocolError("Runtime emitted an unknown event type."));
  }

  return events;
}

function deriveMockCapabilities(
  events: NormalizedRuntimeEvent[],
): RuntimeCapabilities {
  return {
    structuredOutput: events.some((event) => event.kind === "started"),
    streaming: events.some((event) => event.kind === "output"),
    cancellation: events.some(
      (event) => event.kind === "terminal" && event.reason === "cancelled",
    ),
    timeout: events.some(
      (event) => event.kind === "terminal" && event.reason === "timed_out",
    ),
    usage: events.some((event) => event.kind === "usage"),
    resume: false,
  };
}

export const mockRuntimeAdapter: RuntimeAdapter = {
  id: "mock",
  normalize: normalizeMock,
  deriveCapabilities: deriveMockCapabilities,
};

export const CODEX_CLI_VERSION = "codex-cli 0.145.0";

export function assertCodexCliVersion(version: string) {
  if (version.trim() !== CODEX_CLI_VERSION) {
    throw new Error(
      `Unsupported Codex CLI version. Expected ${CODEX_CLI_VERSION}; received ${version.trim() || "unknown"}.`,
    );
  }
}

export function codexExecArgs(workingDirectory: string) {
  return [
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
    workingDirectory,
    "-",
  ];
}

function normalizeCodex(lines: string[]): NormalizedRuntimeEvent[] {
  const events: NormalizedRuntimeEvent[] = [];
  let lastMessage: string | undefined;
  let terminalSeen = false;

  for (const line of lines) {
    let wire: Record<string, unknown>;
    try {
      wire = JSON.parse(line) as Record<string, unknown>;
    } catch {
      events.push(protocolError("Codex emitted malformed JSON."));
      continue;
    }
    const type = typeof wire.type === "string" ? wire.type : "";
    if (type === "thread.started") {
      const threadId = typeof wire.thread_id === "string" ? wire.thread_id : "";
      events.push(
        threadId
          ? { kind: "started", runId: threadId }
          : protocolError("Codex thread event is missing thread_id."),
      );
      continue;
    }
    if (type === "turn.started") continue;
    if (type === "item.started") continue;
    if (type === "item.completed") {
      const item = wire.item as Record<string, unknown> | undefined;
      if (!item || typeof item.type !== "string") {
        events.push(protocolError("Codex item event is invalid."));
        continue;
      }
      if (item.type === "agent_message") {
        const text = safeText(item.text, "runtimeOutput");
        if (text === null) {
          events.push({
            kind: "persistence_rejected",
            message: "Codex output was rejected by the persistence safety gate.",
          });
        } else {
          lastMessage = text;
          events.push({ kind: "output", text });
        }
      } else if (
        item.type === "error" ||
        item.status === "failed" ||
        item.error != null
      ) {
        events.push(protocolError("Codex reported a failed item."));
      }
      continue;
    }
    if (type === "turn.completed") {
      const usage = wire.usage as Record<string, unknown> | undefined;
      if (
        usage &&
        Number.isSafeInteger(usage.input_tokens) &&
        Number.isSafeInteger(usage.output_tokens)
      ) {
        events.push({
          kind: "usage",
          inputTokens: usage.input_tokens as number,
          outputTokens: usage.output_tokens as number,
        });
      }
      if (terminalSeen) {
        events.push(protocolError("Codex emitted more than one terminal turn."));
      } else {
        terminalSeen = true;
        events.push({
          kind: "terminal",
          reason: "completed",
          ...(lastMessage === undefined ? {} : { result: lastMessage }),
        });
      }
      continue;
    }
    events.push(protocolError(`Codex emitted unknown event type: ${type || "missing"}.`));
  }
  return events;
}

export const codexRuntimeAdapter: RuntimeAdapter = {
  id: "codex-cli",
  normalize: normalizeCodex,
  deriveCapabilities: (events) => ({
    structuredOutput: events.some((event) => event.kind === "started"),
    streaming: events.some((event) => event.kind === "output"),
    cancellation: true,
    timeout: true,
    usage: events.some((event) => event.kind === "usage"),
    resume: false,
  }),
};

const registry = new Map<string, RuntimeAdapter>([
  [mockRuntimeAdapter.id, mockRuntimeAdapter],
  [codexRuntimeAdapter.id, codexRuntimeAdapter],
]);

export function getRuntimeAdapter(id: string): RuntimeAdapter {
  const adapter = registry.get(id);
  if (!adapter) throw new Error(`Unsupported runtime adapter: ${id}.`);
  return adapter;
}
