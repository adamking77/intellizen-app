// Sessions and prompts on an ACP agent, with the surface `session.ts` gives
// for the gateway: create, submit, interrupt, subscribe. The Rust side
// (`src-tauri/src/acp.rs`) owns the adapter process and emits `acp:event`
// envelopes in the gateway's event shapes, so `reduceTranscript` folds them
// unchanged.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { ApprovalChoice, ApprovalRequestPayload, MessageCompletePayload } from "./contract";
import type { GatewayClientLike } from "./contract";
import type { ConnectionState, GatewayEvent } from "./json-rpc-gateway";
import { TurnError } from "./session";

export const ACP_EVENT = "acp:event";

/** A gateway-shaped event plus the agent it came from. */
export interface AcpEnvelope extends GatewayEvent {
  agent_id: string;
}

export interface AcpPermissionOption {
  optionId: string;
  name?: string;
  kind?: string;
}

/** `approval.request` from an ACP agent: Hermes's choices plus the
 *  adapter's real options, which the answer must name. */
export interface AcpApprovalPayload extends ApprovalRequestPayload {
  options?: AcpPermissionOption[];
  tool_id?: string;
}

export interface AcpStarted {
  agentId: string;
  sessionId: string;
  pid: number | null;
}

/** The Tauri seam. Tests hand in a fake with `setAcpBridge`. */
export interface AcpBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen(handler: (envelope: AcpEnvelope) => void): Promise<() => void>;
}

const tauriBridge: AcpBridge = {
  invoke: (command, args) => invoke(command, args),
  listen: (handler) => listen<AcpEnvelope>(ACP_EVENT, (event) => handler(event.payload)),
};

let bridge: AcpBridge = tauriBridge;

export function setAcpBridge(next: AcpBridge | null) {
  bridge = next ?? tauriBridge;
  resetAcpSubscription();
}

// ── Events ──────────────────────────────────────────────────────────────

const handlers = new Set<(envelope: AcpEnvelope) => void>();
let listening: Promise<() => void> | null = null;
/** The options each pending permission offered, by `agentId:requestId`,
 *  so a Hermes-style choice can be answered with the adapter's option id. */
const permissionOptions = new Map<string, AcpPermissionOption[]>();

function permissionKey(agentId: string, requestId: string) {
  return `${agentId}:${requestId}`;
}

function dispatch(envelope: AcpEnvelope) {
  if (envelope.type === "approval.request") {
    const payload = (envelope.payload ?? {}) as AcpApprovalPayload;
    if (payload.request_id) {
      permissionOptions.set(permissionKey(envelope.agent_id, payload.request_id), payload.options ?? []);
    }
  } else if (envelope.type === "message.complete") {
    for (const key of [...permissionOptions.keys()]) {
      if (key.startsWith(`${envelope.agent_id}:`)) permissionOptions.delete(key);
    }
  }
  for (const handler of handlers) handler(envelope);
}

function ensureListening() {
  listening ??= bridge.listen(dispatch);
  return listening;
}

/** Subscribe to every ACP agent's events. Returns the unsubscribe. */
export function onAcpEvent(handler: (envelope: AcpEnvelope) => void): () => void {
  handlers.add(handler);
  void ensureListening();
  return () => {
    handlers.delete(handler);
  };
}

/** Test hook: drop the transport subscription and remembered options. */
export function resetAcpSubscription() {
  void listening?.then((unlisten) => unlisten());
  listening = null;
  handlers.clear();
  permissionOptions.clear();
}

// ── Sessions ────────────────────────────────────────────────────────────

/** Spawn the adapter for a registry entry (or reuse the running one) and
 *  complete the ACP handshake. */
export async function startAcpAgent(agentId: string, cwd?: string | null): Promise<AcpStarted> {
  await ensureListening();
  return bridge.invoke<AcpStarted>("acp_start", cwd ? { agentId, cwd } : { agentId });
}

/** The session id, like `createSession` for the gateway. */
export async function createAcpSession(agentId: string, cwd?: string | null): Promise<string> {
  const started = await startAcpAgent(agentId, cwd);
  if (!started.sessionId) throw new Error("acp_start returned no session id");
  return started.sessionId;
}

export function submitAcpPrompt(agentId: string, text: string): Promise<void> {
  return bridge.invoke<void>("acp_prompt", { agentId, text });
}

export function interruptAcpSession(agentId: string): Promise<void> {
  return bridge.invoke<void>("acp_cancel", { agentId });
}

/** Kill the adapter process. The next `startAcpAgent` spawns a fresh one. */
export function stopAcpAgent(agentId: string): Promise<void> {
  return bridge.invoke<void>("acp_stop", { agentId });
}

const clients = new Map<string, GatewayClientLike>();

/** ACP behind the gateway-shaped seam the room engine already uses. */
export function acpGatewayClient(agentId: string): GatewayClientLike {
  const existing = clients.get(agentId);
  if (existing) return existing;
  const client: GatewayClientLike = {
    connectionState: "open" as ConnectionState,
    async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
      if (method === "session.create") return { session_id: await createAcpSession(agentId) } as T;
      if (method === "prompt.submit") {
        await submitAcpPrompt(agentId, String(params.text ?? ""));
        return { status: "streaming" } as T;
      }
      if (method === "session.interrupt") return (await interruptAcpSession(agentId)) as T;
      if (method === "approval.respond") {
        await respondAcpApproval({
          agentId,
          requestId: String(params.request_id ?? ""),
          choice: params.choice as ApprovalChoice,
        });
        return { resolved: 1 } as T;
      }
      throw new Error(`${method} is not available over ACP.`);
    },
    onAny(handler) {
      return onAcpEvent((event) => {
        if (event.agent_id === agentId) handler(event);
      });
    },
    onState(handler) {
      handler("open");
      return () => undefined;
    },
  };
  clients.set(agentId, client);
  return client;
}

/** The adapter option that means what Hermes's choice means. `session` has
 *  no ACP equivalent and settles for `allow_always`. */
export function optionIdForChoice(
  options: AcpPermissionOption[],
  choice: ApprovalChoice,
): string | null {
  const wanted: string[] =
    choice === "once"
      ? ["allow_once", "allow_always"]
      : choice === "deny"
        ? ["reject_once", "reject_always"]
        : ["allow_always", "allow_once"];
  for (const kind of wanted) {
    const match = options.find((o) => o.kind === kind);
    if (match) return match.optionId;
  }
  return options[0]?.optionId ?? null;
}

export async function respondAcpApproval(input: {
  agentId: string;
  requestId: string;
  choice: ApprovalChoice;
}): Promise<void> {
  const key = permissionKey(input.agentId, input.requestId);
  const optionId = optionIdForChoice(permissionOptions.get(key) ?? [], input.choice);
  if (!optionId) throw new Error(`No pending permission ${input.requestId} for ${input.agentId}.`);
  await bridge.invoke<void>("acp_respond_permission", {
    agentId: input.agentId,
    requestId: input.requestId,
    optionId,
  });
  permissionOptions.delete(key);
}

export interface RunAcpPromptInput {
  agentId: string;
  text: string;
  signal?: AbortSignal;
  /** Whole-turn deadline. Default ten minutes. */
  timeoutMs?: number;
}

/** One prompt, one reply, like `runPrompt` for the gateway: starts the
 *  agent, submits, and resolves with the streamed text on `message.complete`.
 *  A permission request during an unattended turn is denied: nobody is
 *  there to answer it. Workflow dispatch uses this. */
export async function runAcpPrompt(input: RunAcpPromptInput): Promise<{ sessionId: string; text: string }> {
  const timeoutMs = input.timeoutMs ?? 10 * 60_000;
  if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const sessionId = await createAcpSession(input.agentId);

  return new Promise((resolve, reject) => {
    let settled = false;
    let text = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      outcome();
    };
    const onAbort = () => {
      void interruptAcpSession(input.agentId).catch(() => undefined);
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };

    unsubscribe = onAcpEvent((envelope) => {
      if (envelope.agent_id !== input.agentId) return;
      if (envelope.type === "message.delta") {
        const delta = (envelope.payload as { text?: unknown } | undefined)?.text;
        if (typeof delta === "string") text += delta;
        return;
      }
      if (envelope.type === "approval.request") {
        const requestId = (envelope.payload as AcpApprovalPayload | undefined)?.request_id;
        if (requestId) {
          void respondAcpApproval({ agentId: input.agentId, requestId, choice: "deny" }).catch(() => undefined);
        }
        return;
      }
      if (envelope.type !== "message.complete") return;
      const payload = (envelope.payload ?? {}) as MessageCompletePayload;
      if (payload.status === "error") {
        finish(() => reject(new TurnError(payload.error?.trim() || "The agent reported an error", sessionId, "error")));
      } else if (payload.status === "interrupted") {
        finish(() => reject(new TurnError("The turn was interrupted.", sessionId, "interrupted")));
      } else {
        finish(() => resolve({ sessionId, text: payload.text || text }));
      }
    });

    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        void interruptAcpSession(input.agentId).catch(() => undefined);
        finish(() =>
          reject(new TurnError(`The turn did not finish within ${Math.round(timeoutMs / 1000)}s.`, sessionId, "timeout")),
        );
      }, timeoutMs);
    }
    submitAcpPrompt(input.agentId, input.text).catch((error: unknown) => {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  });
}
