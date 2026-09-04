// Sessions and prompts through the gateway. Every function takes the client
// first so tests inject a fake; the panel hands in `getGatewayClient()`.

import {
  request,
  type GatewayClientLike,
  type MessageCompletePayload,
  type SessionCreateResult,
  type SessionEventsResult,
  type SessionHistoryResult,
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
  return (await createSessionHandle(client, input)).session_id;
}

export async function createSessionHandle(
  client: GatewayClientLike,
  input: { profile: string; cwd?: string | null },
): Promise<SessionCreateResult> {
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
  return result;
}

export async function resumeSession(
  client: GatewayClientLike,
  input: { profile: string; storedSessionId: string },
): Promise<SessionCreateResult> {
  const result = await request<SessionCreateResult>(client, "session.resume", {
    session_id: input.storedSessionId,
    profile: input.profile,
  });
  if (!result || typeof result.session_id !== "string" || !result.session_id) {
    throw new Error("session.resume returned no session id");
  }
  return result;
}

export function sessionHistory(
  client: GatewayClientLike,
  sessionId: string,
): Promise<SessionHistoryResult> {
  return request(client, "session.history", { session_id: sessionId });
}

export function sessionEventsSince(
  client: GatewayClientLike,
  sessionId: string,
  lastSeen: number,
): Promise<SessionEventsResult> {
  return request(client, "session.events.since", {
    session_id: sessionId,
    last_seen: lastSeen,
  });
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

export interface SessionAttachment {
  path: string;
  name: string;
}

function extension(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function fileReference(path: string): string {
  return /[\s()[\]{}<>"'`]/.test(path) && !path.includes("`") ? `@file:\`${path}\`` : `@file:${path}`;
}

/** Stage files on Hermes before the prompt that consumes them. Images and
 * PDFs use the gateway's vision path; everything else gets an `@file:` ref. */
export async function attachmentPrompt(
  client: GatewayClientLike,
  sessionId: string,
  text: string,
  attachments: SessionAttachment[],
): Promise<string> {
  const refs: string[] = [];
  for (const attachment of attachments) {
    const ext = extension(attachment.name);
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].includes(ext)) {
      const result = await request<{ attached?: boolean; text?: string }>(client, "image.attach", {
        session_id: sessionId,
        path: attachment.path,
      });
      if (!result.attached) throw new Error(`Hermes could not attach ${attachment.name}.`);
      refs.push(result.text || `[User attached image: ${attachment.name}]`);
    } else if (ext === ".pdf") {
      const result = await request<{ attached?: boolean; text?: string }>(client, "pdf.attach", {
        session_id: sessionId,
        path: attachment.path,
      });
      if (!result.attached) throw new Error(`Hermes could not attach ${attachment.name}.`);
      refs.push(result.text || `[User attached PDF: ${attachment.name}]`);
    } else {
      const result = await request<{ attached?: boolean; ref_text?: string }>(client, "file.attach", {
        session_id: sessionId,
        path: attachment.path,
        name: attachment.name,
      });
      if (!result.attached || !result.ref_text) throw new Error(`Hermes could not attach ${attachment.name}.`);
      refs.push(result.ref_text);
    }
  }
  return [text.trim(), ...refs].filter(Boolean).join("\n");
}

/** ACP sessions cannot use Hermes staging, but local ACP agents can consume
 * the same picked files through explicit absolute `@file:` refs. */
export function acpAttachmentPrompt(text: string, attachments: SessionAttachment[]): string {
  return [text.trim(), ...attachments.map((attachment) => fileReference(attachment.path))].filter(Boolean).join("\n");
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
