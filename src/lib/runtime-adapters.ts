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

const registry = new Map<string, RuntimeAdapter>([
  [mockRuntimeAdapter.id, mockRuntimeAdapter],
]);

export function getRuntimeAdapter(id: string): RuntimeAdapter {
  const adapter = registry.get(id);
  if (!adapter) throw new Error(`Unsupported runtime adapter: ${id}.`);
  return adapter;
}

