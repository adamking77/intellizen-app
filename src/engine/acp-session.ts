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
  session_id: string;
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
/** The options each pending permission offered, by `sessionId:requestId`,
 *  so a Hermes-style choice can be answered with the adapter's option id. */
const permissionOptions = new Map<string, AcpPermissionOption[]>();

function permissionKey(sessionId: string, requestId: string) {
  return `${sessionId}:${requestId}`;
}

function dispatch(envelope: AcpEnvelope) {
  if (envelope.type === "approval.request") {
    const payload = (envelope.payload ?? {}) as AcpApprovalPayload;
    if (payload.request_id) {
      permissionOptions.set(permissionKey(envelope.session_id, payload.request_id), payload.options ?? []);
    }
  } else if (envelope.type === "message.complete") {
    for (const key of [...permissionOptions.keys()]) {
      if (key.startsWith(`${envelope.session_id}:`)) permissionOptions.delete(key);
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
  clients.clear();
}

// ── Sessions ────────────────────────────────────────────────────────────

/** Spawn the adapter for a registry entry (or reuse the running one) and
 *  complete the ACP handshake. */
export async function startAcpAgent(agentId: string, caller = "panel", cwd?: string | null): Promise<AcpStarted> {
  await ensureListening();
  return bridge.invoke<AcpStarted>("acp_start", cwd ? { agentId, caller, cwd } : { agentId, caller });
}

/** The session id, like `createSession` for the gateway. */
export async function createAcpSession(agentId: string, caller = "panel", cwd?: string | null): Promise<string> {
  const started = await startAcpAgent(agentId, caller, cwd);
  if (!started.sessionId) throw new Error("acp_start returned no session id");
  return started.sessionId;
}

export function submitAcpPrompt(sessionId: string, text: string): Promise<void> {
  return bridge.invoke<void>("acp_prompt", { sessionId, text });
}

export function interruptAcpSession(sessionId: string): Promise<void> {
  return bridge.invoke<void>("acp_cancel", { sessionId });
}

/** Kill the adapter process. The next `startAcpAgent` spawns a fresh one. */
export function stopAcpAgent(sessionId: string): Promise<void> {
  return bridge.invoke<void>("acp_stop", { sessionId });
}

const clients = new Map<string, GatewayClientLike>();

/** ACP behind the gateway-shaped seam the room engine already uses. */
export function acpGatewayClient(agentId: string, caller: string, cwd?: string | null): GatewayClientLike {
  const key = JSON.stringify([agentId, caller, cwd ?? null]);
  const existing = clients.get(key);
  if (existing) return existing;
  let sessionId: string | null = null;
  const client: GatewayClientLike = {
    connectionState: "open" as ConnectionState,
    async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
      if (method === "session.create") {
        sessionId = await createAcpSession(agentId, caller, String(params.cwd ?? cwd ?? "") || null);
        return { session_id: sessionId } as T;
      }
      if (method === "prompt.submit") {
        if (!sessionId) throw new Error(`No ACP session is open for ${agentId}.`);
        await submitAcpPrompt(sessionId, String(params.text ?? ""));
        return { status: "streaming" } as T;
      }
      if (method === "session.interrupt") {
        if (!sessionId) return undefined as T;
        return (await interruptAcpSession(sessionId)) as T;
      }
      if (method === "approval.respond") {
        if (!sessionId) throw new Error(`No ACP session is open for ${agentId}.`);
        await respondAcpApproval({
          sessionId,
          requestId: String(params.request_id ?? ""),
          choice: params.choice as ApprovalChoice,
        });
        return { resolved: 1 } as T;
      }
      throw new Error(`${method} is not available over ACP.`);
    },
    onAny(handler) {
      return onAcpEvent((event) => {
        if (event.session_id === sessionId) handler(event);
      });
    },
    onState(handler) {
      handler("open");
      return () => undefined;
    },
  };
  clients.set(key, client);
  return client;
}

/** The exact adapter option represented by a displayed choice. Choices that
 *  ACP did not offer do not silently widen or narrow the permission. */
export function optionIdForChoice(
  options: AcpPermissionOption[],
  choice: ApprovalChoice,
): string | null {
  const kinds: Partial<Record<ApprovalChoice, string>> = {
    once: "allow_once",
    always: "allow_always",
    deny: "reject_once",
    deny_always: "reject_always",
  };
  const kind = kinds[choice];
  return kind ? options.find((option) => option.kind === kind)?.optionId ?? null : null;
}

export async function respondAcpApproval(input: {
  sessionId: string;
  requestId: string;
  choice: ApprovalChoice;
}): Promise<void> {
  const key = permissionKey(input.sessionId, input.requestId);
  const optionId = optionIdForChoice(permissionOptions.get(key) ?? [], input.choice);
  if (!optionId) throw new Error(`No pending permission ${input.requestId} for ${input.sessionId}.`);
  await bridge.invoke<void>("acp_respond_permission", {
    sessionId: input.sessionId,
    requestId: input.requestId,
    optionId,
  });
  permissionOptions.delete(key);
}

export interface RunAcpPromptInput {
  agentId: string;
  text: string;
  caller?: string;
  cwd?: string | null;
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
  const sessionId = await createAcpSession(input.agentId, input.caller ?? "workflow", input.cwd);

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
      void interruptAcpSession(sessionId).catch(() => undefined);
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };

    unsubscribe = onAcpEvent((envelope) => {
      if (envelope.session_id !== sessionId) return;
      if (envelope.type === "message.delta") {
        const delta = (envelope.payload as { text?: unknown } | undefined)?.text;
        if (typeof delta === "string") text += delta;
        return;
      }
      if (envelope.type === "approval.request") {
        const requestId = (envelope.payload as AcpApprovalPayload | undefined)?.request_id;
        if (requestId) {
          void respondAcpApproval({ sessionId, requestId, choice: "deny" }).catch(() => undefined);
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
        void interruptAcpSession(sessionId).catch(() => undefined);
        finish(() =>
          reject(new TurnError(`The turn did not finish within ${Math.round(timeoutMs / 1000)}s.`, sessionId, "timeout")),
        );
      }, timeoutMs);
    }
    submitAcpPrompt(sessionId, input.text).catch((error: unknown) => {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  });
}
