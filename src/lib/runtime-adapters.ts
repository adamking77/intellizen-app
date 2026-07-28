import { assertPersistenceSafe } from "../../shared/persistence-redaction.mjs";

export type RuntimeTerminalReason =
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type RuntimeFailureCode =
  | "auth_lost"
  | "parent_lost"
  | "orphaned_child"
  | "resume_unsupported"
  | "ambiguous_delivery";

export type NormalizedRuntimeEvent =
  | { kind: "started"; runId: string }
  | {
      kind: "initialized";
      runId: string;
      model: string;
      mcpServers: string[];
      tools: string[];
      permissionMode: string;
    }
  | { kind: "output"; text: string }
  | { kind: "usage"; inputTokens: number; outputTokens: number }
  | { kind: "provider_event"; eventType: string }
  | { kind: "protocol_error"; message: string }
  | {
      kind: "runtime_error";
      code: RuntimeFailureCode;
      message: string;
      resultKnown: boolean;
      retryable: boolean;
    }
  | { kind: "persistence_rejected"; message: string }
  | { kind: "terminal"; reason: RuntimeTerminalReason; result?: string };

export type RuntimeAdapter = {
  id: string;
  normalize(lines: string[]): NormalizedRuntimeEvent[];
};

type MockWireEvent =
  | { type: "run.started"; runId: string }
  | { type: "output.delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "run.completed"; result: string }
  | { type: "run.failed"; message: string }
  | { type: "run.cancelled" }
  | { type: "run.timed_out" }
  | { type: "run.auth_lost" }
  | { type: "run.parent_lost" }
  | { type: "run.orphaned_child" }
  | { type: "run.resume_unsupported" }
  | { type: "run.delivery_ambiguous" };

const MOCK_FAILURES: Record<
  Extract<MockWireEvent["type"], `run.${string}`>,
  {
    code: RuntimeFailureCode;
    message: string;
    resultKnown: boolean;
    retryable: boolean;
  } | null
> = {
  "run.started": null,
  "run.completed": null,
  "run.failed": null,
  "run.cancelled": null,
  "run.timed_out": null,
  "run.auth_lost": {
    code: "auth_lost",
    message: "Runtime authentication was lost during the session.",
    resultKnown: false,
    retryable: false,
  },
  "run.parent_lost": {
    code: "parent_lost",
    message: "The runtime parent process disappeared before a terminal result.",
    resultKnown: false,
    retryable: false,
  },
  "run.orphaned_child": {
    code: "orphaned_child",
    message: "A runtime child process outlived its parent and required cleanup.",
    resultKnown: false,
    retryable: false,
  },
  "run.resume_unsupported": {
    code: "resume_unsupported",
    message: "The runtime cannot resume this interrupted session.",
    resultKnown: false,
    retryable: false,
  },
  "run.delivery_ambiguous": {
    code: "ambiguous_delivery",
    message: "Runtime delivery may have occurred, but no result can be confirmed.",
    resultKnown: false,
    retryable: false,
  },
};

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

    const runtimeFailure =
      wire.type in MOCK_FAILURES
        ? MOCK_FAILURES[wire.type as keyof typeof MOCK_FAILURES]
        : null;
    if (runtimeFailure) {
      events.push({ kind: "runtime_error", ...runtimeFailure });
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

export const mockRuntimeAdapter: RuntimeAdapter = {
  id: "mock",
  normalize: normalizeMock,
};

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
  let failed = false;

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
          failed = true;
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
        failed = true;
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
          reason: failed ? "failed" : "completed",
          ...(!failed && lastMessage !== undefined ? { result: lastMessage } : {}),
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
};

export const CLAUDE_CLI_VERSION = "2.1.220 (Claude Code)";

export const CLAUDE_WORKER_TOOLS = [
  "advance_workflow_step",
  "append_agent_work_note",
  "list_agent_projects",
  "list_agent_work",
  "list_databases",
  "list_role_assignments",
  "list_roles",
  "list_workflow_runs",
  "list_workflows",
  "query_records",
  "report_verification",
] as const;

export function assertClaudeCliVersion(version: string) {
  if (version.trim() !== CLAUDE_CLI_VERSION) {
    throw new Error(
      `Unsupported Claude CLI version. Expected ${CLAUDE_CLI_VERSION}; received ${version.trim() || "unknown"}.`,
    );
  }
}

export function claudeMcpToolName(tool: string) {
  return `mcp__intelizen-worker__${tool}`;
}

export function claudeExecArgs(mcpConfigPath: string) {
  const tools = CLAUDE_WORKER_TOOLS.map(claudeMcpToolName).join(",");
  return [
    "--mcp-config",
    mcpConfigPath,
    "--strict-mcp-config",
    "--tools",
    tools,
    "--allowedTools",
    tools,
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--verbose",
    "--include-partial-messages",
    "--output-format",
    "stream-json",
    "-p",
  ];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate === "string") return [candidate];
    if (
      candidate &&
      typeof candidate === "object" &&
      "name" in candidate &&
      typeof candidate.name === "string"
    ) {
      return [candidate.name];
    }
    return [];
  });
}

function normalizeClaude(lines: string[]): NormalizedRuntimeEvent[] {
  const events: NormalizedRuntimeEvent[] = [];
  let terminalSeen = false;

  for (const line of lines) {
    let wire: Record<string, unknown>;
    try {
      wire = JSON.parse(line) as Record<string, unknown>;
    } catch {
      events.push(protocolError("Claude emitted malformed JSON."));
      continue;
    }
    const type = typeof wire.type === "string" ? wire.type : "";

    if (type === "system" && wire.subtype === "init") {
      const runId = typeof wire.session_id === "string" ? wire.session_id : "";
      if (!runId) {
        events.push(protocolError("Claude init event is missing session_id."));
        continue;
      }
      events.push({ kind: "started", runId });
      events.push({
        kind: "initialized",
        runId,
        model: typeof wire.model === "string" ? wire.model : "",
        mcpServers: stringArray(wire.mcp_servers),
        tools: stringArray(wire.tools),
        permissionMode:
          typeof wire.permissionMode === "string" ? wire.permissionMode : "",
      });
      continue;
    }

    if (type === "stream_event") {
      const stream = wire.event as Record<string, unknown> | undefined;
      if (stream?.type === "content_block_delta") {
        const delta = stream.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta") {
          const text = safeText(delta.text, "runtimeOutput");
          events.push(
            text === null
              ? {
                  kind: "persistence_rejected",
                  message: "Claude output was rejected by the persistence safety gate.",
                }
              : { kind: "output", text },
          );
        }
      }
      continue;
    }

    if (type === "assistant") {
      // Claude emits this assembled snapshot after its deltas. Do not append it
      // after the same content has already streamed.
      continue;
    }

    if (type === "result") {
      if (terminalSeen) {
        events.push(protocolError("Claude emitted more than one terminal result."));
        continue;
      }
      terminalSeen = true;
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
      const failed =
        wire.is_error === true ||
        wire.subtype !== "success" ||
        (typeof wire.terminal_reason === "string" &&
          wire.terminal_reason !== "completed");
      const result = safeText(wire.result, "runtimeResult");
      if (result === null && wire.result != null) {
        events.push({
          kind: "persistence_rejected",
          message: "Claude result was rejected by the persistence safety gate.",
        });
      }
      events.push({
        kind: "terminal",
        reason: failed ? "failed" : "completed",
        ...(result !== null ? { result } : {}),
      });
      continue;
    }

    if (type) {
      events.push({ kind: "provider_event", eventType: type });
    } else {
      events.push(protocolError("Claude event is missing a type."));
    }
  }
  return events;
}

export function assertClaudeWorkerIsolation(
  events: NormalizedRuntimeEvent[],
): Extract<NormalizedRuntimeEvent, { kind: "initialized" }> {
  const initialized = events.find(
    (event): event is Extract<NormalizedRuntimeEvent, { kind: "initialized" }> =>
      event.kind === "initialized",
  );
  if (!initialized) {
    throw new Error("Claude did not emit the required system/init event.");
  }
  if (
    initialized.mcpServers.length !== 1 ||
    initialized.mcpServers[0] !== "intelizen-worker"
  ) {
    throw new Error(
      `Claude worker isolation failed: expected only intelizen-worker; received ${initialized.mcpServers.join(", ") || "none"}.`,
    );
  }
  const expectedTools = CLAUDE_WORKER_TOOLS.map(claudeMcpToolName).sort();
  const actualTools = [...initialized.tools].sort();
  if (
    expectedTools.length !== actualTools.length ||
    expectedTools.some((tool, index) => tool !== actualTools[index])
  ) {
    throw new Error("Claude worker isolation failed: system/init tool allowlist differed.");
  }
  if (initialized.permissionMode !== "dontAsk") {
    throw new Error(
      `Claude worker isolation failed: permission mode was ${initialized.permissionMode || "missing"}.`,
    );
  }
  return initialized;
}

export const claudeRuntimeAdapter: RuntimeAdapter = {
  id: "claude-cli",
  normalize: normalizeClaude,
};

const registry = new Map<string, RuntimeAdapter>([
  [mockRuntimeAdapter.id, mockRuntimeAdapter],
  [codexRuntimeAdapter.id, codexRuntimeAdapter],
  [claudeRuntimeAdapter.id, claudeRuntimeAdapter],
]);

export function getRuntimeAdapter(id: string): RuntimeAdapter {
  const adapter = registry.get(id);
  if (!adapter) throw new Error(`Unsupported runtime adapter: ${id}.`);
  return adapter;
}
