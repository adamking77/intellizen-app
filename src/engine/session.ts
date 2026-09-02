// Sessions and prompts through the gateway. Every function takes the client
// first so tests inject a fake; the panel hands in `getGatewayClient()`.

import {
  request,
  type GatewayClientLike,
  type MessageCompletePayload,
  type SessionCreateResult,
} from "./contract";
import { JsonRpcGatewayError, type GatewayEvent } from "./json-rpc-gateway";

/** Hermes's error code for a session id it no longer knows. */
export const SESSION_NOT_FOUND = 4001;

export function isSessionNotFound(error: unknown): boolean {
  return error instanceof JsonRpcGatewayError && error.code === SESSION_NOT_FOUND;
}

export async function createSession(
  client: GatewayClientLike,
  input: { profile: string; cwd?: string | null },
): Promise<string> {
  const params: Record<string, unknown> = {
    cols: 96,
    source: "desktop",
    profile: input.profile,
  };
  if (input.cwd) params.cwd = input.cwd;
  const result = await request<SessionCreateResult>(client, "session.create", params);
  if (!result || typeof result.session_id !== "string" || !result.session_id) {
    throw new Error("session.create returned no session id");
  }
  return result.session_id;
}

export function submitPrompt(
  client: GatewayClientLike,
  sessionId: string,
  text: string,
): Promise<{ status?: string }> {
  return request<{ status?: string }>(client, "prompt.submit", {
    session_id: sessionId,
    text,
  });
}

export function interruptSession(
  client: GatewayClientLike,
  sessionId: string,
): Promise<unknown> {
  return request(client, "session.interrupt", { session_id: sessionId });
}

export interface RunPromptInput {
  profile: string;
  text: string;
  cwd?: string | null;
  signal?: AbortSignal;
  /** Whole-turn deadline. Default ten minutes. */
  timeoutMs?: number;
}

export interface RunPromptResult {
  sessionId: string;
  text: string;
}

export class TurnError extends Error {
  readonly sessionId: string;
  readonly status: "error" | "interrupted" | "timeout";

  constructor(message: string, sessionId: string, status: TurnError["status"]) {
    super(message);
    this.name = "TurnError";
    this.sessionId = sessionId;
    this.status = status;
  }
}

/** One prompt, one reply: creates a session on the profile, submits the
 *  text, and resolves with the final text when `message.complete` arrives
 *  for that session. Hermes at the pinned revision ends every turn with
 *  `message.complete`; its `status` field says how (see the recorded frames
 *  in `src/fixtures/gateway-frames`). Workflow dispatch uses this. */
export async function runPrompt(
  client: GatewayClientLike,
  input: RunPromptInput,
): Promise<RunPromptResult> {
  const timeoutMs = input.timeoutMs ?? 10 * 60_000;
  if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const sessionId = await createSession(client, { profile: input.profile, cwd: input.cwd });

  return new Promise<RunPromptResult>((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      unsubscribe = null;
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      outcome();
    };

    const onAbort = () => {
      void interruptSession(client, sessionId).catch(() => undefined);
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    };

    const onEvent = (event: GatewayEvent) => {
      if (event.session_id !== sessionId || event.type !== "message.complete") return;
      const payload = (event.payload ?? {}) as MessageCompletePayload;
      const text = typeof payload.text === "string" ? payload.text : "";
      if (payload.status === "error") {
        const reason = (typeof payload.error === "string" && payload.error.trim()) || text.trim() || "Hermes reported an error";
        finish(() => reject(new TurnError(reason, sessionId, "error")));
        return;
      }
      if (payload.status === "interrupted") {
        finish(() => reject(new TurnError("The turn was interrupted.", sessionId, "interrupted")));
        return;
      }
      finish(() => resolve({ sessionId, text }));
    };

    unsubscribe = client.onAny(onEvent);
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        void interruptSession(client, sessionId).catch(() => undefined);
        finish(() =>
          reject(
            new TurnError(
              `The turn did not finish within ${Math.round(timeoutMs / 1000)}s.`,
              sessionId,
              "timeout",
            ),
          ),
        );
      }, timeoutMs);
    }

    submitPrompt(client, sessionId, input.text).catch((error: unknown) => {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  });
}
