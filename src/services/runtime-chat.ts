import {
  assertClaudeWorkerIsolation,
  codexExecArgs,
  getRuntimeAdapter,
  type NormalizedRuntimeEvent,
} from "@/lib/runtime-adapters";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import {
  listRuntimeBindings,
  type RuntimeBinding,
} from "@/services/runtime-bindings";
import { cancelRuntime, runRuntime } from "@/services/runtimes";

export interface RuntimeChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export function buildRuntimeChatPrompt(input: {
  roleName: string;
  agentName: string;
  history: RuntimeChatHistoryTurn[];
  message: string;
}) {
  const history = input.history
    .slice(-12)
    .map((turn) => `${turn.role === "user" ? "User" : input.agentName}: ${turn.content}`)
    .join("\n\n");
  return [
    `You are ${input.agentName}, the current occupant of the ${input.roleName} role in IntelliZen.`,
    "Respond to the user's message. Do not claim a tool action, record write, approval, or verification unless the runtime actually performed it and returned evidence.",
    history ? `Visible conversation history:\n${history}` : "",
    `User: ${input.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function runtimeChatResultFromEvents(events: NormalizedRuntimeEvent[]) {
  const rejected = events.find(
    (event) => event.kind === "persistence_rejected",
  );
  if (rejected?.kind === "persistence_rejected") {
    throw new Error(rejected.message);
  }
  const runtimeError = events.find(
    (
      event,
    ): event is Extract<NormalizedRuntimeEvent, { kind: "runtime_error" }> =>
      event.kind === "runtime_error",
  );
  if (runtimeError) {
    throw new Error(`${runtimeError.code}: ${runtimeError.message}`);
  }
  const protocolError = events.find(
    (
      event,
    ): event is Extract<NormalizedRuntimeEvent, { kind: "protocol_error" }> =>
      event.kind === "protocol_error",
  );
  if (protocolError) {
    throw new Error(protocolError.message);
  }
  const terminal = [...events]
    .reverse()
    .find(
      (
        event,
      ): event is Extract<NormalizedRuntimeEvent, { kind: "terminal" }> =>
        event.kind === "terminal",
    );
  if (!terminal || terminal.reason !== "completed") {
    throw new Error(
      `Runtime chat ended without a completed result (${terminal?.reason ?? "missing terminal"}).`,
    );
  }
  const session = events.find(
    (event): event is Extract<NormalizedRuntimeEvent, { kind: "started" }> =>
      event.kind === "started",
  );
  const usage = [...events]
    .reverse()
    .find(
      (event): event is Extract<NormalizedRuntimeEvent, { kind: "usage" }> =>
        event.kind === "usage",
    );
  const providerEvents = events.flatMap((event) =>
    event.kind === "provider_event" ? [event.eventType] : [],
  );
  return {
    sessionId: session?.runId ?? "",
    text:
      terminal.result ??
      events
        .filter(
          (event): event is Extract<NormalizedRuntimeEvent, { kind: "output" }> =>
            event.kind === "output",
        )
        .map((event) => event.text)
        .join(""),
    usage: usage
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        }
      : null,
    diagnostics: {
      providerEvents,
    },
  };
}

function bindingForRole(
  role: AgentPanelRoleTarget,
  bindings: RuntimeBinding[],
) {
  if (!role.bindingRef) throw new Error(`${role.roleName} has no runtime binding.`);
  const binding = bindings.find(
    (candidate) => candidate.bindingId === role.bindingRef,
  );
  if (!binding) {
    throw new Error(`Runtime binding ${role.bindingRef} is unavailable on this Mac.`);
  }
  if (binding.adapterId !== role.adapterId) {
    throw new Error(`Runtime binding ${role.bindingRef} no longer matches the role assignment.`);
  }
  return binding;
}

export async function streamRoleRuntimeChat(input: {
  role: AgentPanelRoleTarget;
  history: RuntimeChatHistoryTurn[];
  message: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}) {
  if (
    input.role.adapterId !== "codex-cli" &&
    input.role.adapterId !== "claude-cli"
  ) {
    throw new Error(`${input.role.roleName} is not assigned to a local CLI runtime.`);
  }
  const store = await listRuntimeBindings();
  const binding = bindingForRole(input.role, store.bindings);
  const workingDirectory = binding.workingDirGrants[0];
  if (!workingDirectory) throw new Error("Runtime binding has no working-directory grant.");
  const adapter = getRuntimeAdapter(binding.adapterId);
  const stdout: string[] = [];
  const runId = `panel-${crypto.randomUUID()}`;
  const abort = () => {
    void cancelRuntime(runId);
  };
  input.signal.addEventListener("abort", abort, { once: true });
  try {
    const exit = await runRuntime(
      {
        runId,
        binary: binding.canonicalBinary,
        args:
          binding.adapterId === "codex-cli"
            ? codexExecArgs(workingDirectory)
            : binding.argTemplates,
        workingDirectory,
        stdin: buildRuntimeChatPrompt({
          roleName: input.role.roleName,
          agentName: input.role.agentName ?? input.role.agentKey ?? "Agent",
          history: input.history,
          message: input.message,
        }),
        timeoutMs: 10 * 60 * 1000,
        environment:
          binding.adapterId === "codex-cli"
            ? {
                CODEX_HOME: binding.workerProfileHome,
                NO_COLOR: "1",
                TERM: "dumb",
              }
            : {
                CLAUDE_CONFIG_DIR: binding.workerProfileHome,
                NO_COLOR: "1",
                TERM: "dumb",
              },
      },
      (event) => {
        if (event.kind !== "stdout" || !event.text) return;
        stdout.push(event.text);
        for (const normalized of adapter.normalize([event.text])) {
          if (normalized.kind === "output") input.onDelta(normalized.text);
        }
      },
    );
    if (input.signal.aborted || exit.reason === "cancelled") {
      throw new DOMException("Runtime response was stopped.", "AbortError");
    }
    if (exit.reason !== "completed") {
      throw new Error(`Runtime process ended ${exit.reason}.`);
    }
    const events = adapter.normalize(stdout);
    if (binding.adapterId === "claude-cli") {
      assertClaudeWorkerIsolation(events);
    }
    return runtimeChatResultFromEvents(events);
  } finally {
    input.signal.removeEventListener("abort", abort);
  }
}
