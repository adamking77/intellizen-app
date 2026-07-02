import { supabase } from "@/lib/supabase";
import type { GraphEntityType } from "@/lib/types";

export interface AgentContext {
  type: string;
  id?: string | number | null;
  route?: string;
  payload?: Record<string, unknown>;
}

export interface AgentWorkflowInput {
  workflowId: string;
  task: string;
  context: AgentContext;
  priority?: "low" | "normal" | "high" | "urgent";
  config?: Record<string, unknown>;
  prompt?: string;
}

export interface AgentChatInput {
  message: string;
  targetAgent: string;
  /** Hermes profile to route through (profile-scoped webhook). */
  profile?: string | null;
  context: AgentContext;
  submit?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
}

export interface AgentSubmission {
  status: "submitted" | "queued";
  messageId?: string;
  inboxItemId?: string;
  /** Why gateway dispatch failed when the message fell back to the inbox queue. */
  dispatchError?: string;
}

export interface GraphExtractionOutput {
  entities: Array<{ label: string; type: GraphEntityType }>;
  relationships: Array<{ source: string; target: string; relation: string }>;
}

const hermesGatewayUrl =
  import.meta.env.VITE_HERMES_GATEWAY_URL?.replace(/\/$/, "") || null;
const hermesWebhookName = import.meta.env.VITE_HERMES_WEBHOOK_NAME || "intellizen";
const hermesWebhookSecret = import.meta.env.VITE_HERMES_WEBHOOK_SECRET || "";
const hermesDashboardUrl =
  import.meta.env.VITE_HERMES_VOICE_URL?.replace(/\/$/, "") || null;

export interface HermesProfile {
  name: string;
  isDefault: boolean;
  model: string | null;
  provider: string | null;
  gatewayRunning: boolean;
  description: string;
}

// The webhook gateway currently running is Fiona's profile-scoped instance;
// used as the known profile when the dashboard (profile catalog) is offline.
export const DEFAULT_HERMES_PROFILE = "fiona";

// ── Hermes API server (OpenAI-compatible, streaming) ───────────────────────

const hermesApiUrl = import.meta.env.VITE_HERMES_API_URL?.replace(/\/$/, "") || null;
const hermesApiKey = import.meta.env.VITE_HERMES_API_KEY || "";

/** True when the streaming chat API is configured and reachable. */
export async function checkHermesApi(): Promise<boolean> {
  if (!hermesApiUrl || !hermesApiKey) return false;
  try {
    const res = await fetch(`${hermesApiUrl}/health`, { signal: AbortSignal.timeout(2_500) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface HermesStreamResult {
  text: string;
  sessionId: string | null;
}

export interface HermesChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream a chat turn from Hermes over /v1/chat/completions (SSE).
 * Continuity is stateless via the messages array (the X-Hermes-Session-Id
 * header is not in the server's CORS allow-list, so browsers cannot send it
 * — upstream Hermes gap; revisit when Access-Control-Allow-Headers grows).
 */
export async function streamHermesChat(input: {
  message: string;
  history?: HermesChatTurn[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}): Promise<HermesStreamResult> {
  if (!hermesApiUrl || !hermesApiKey) throw new Error("Hermes API is not configured.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${hermesApiKey}`,
  };

  const res = await fetch(`${hermesApiUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    signal: input.signal,
    body: JSON.stringify({
      model: "hermes-agent",
      stream: true,
      messages: [...(input.history ?? []), { role: "user", content: input.message }],
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Hermes chat failed (${res.status}): ${detail || res.statusText}`);
  }

  const sessionId = res.headers.get("X-Hermes-Session-Id");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          input.onDelta(delta);
        }
      } catch {
        /* keep-alive or non-JSON frame */
      }
    }
  }

  return { text, sessionId };
}

/**
 * Health-check the Hermes webhook gateway — the transport chat actually
 * uses. A 2xx on the CORS preflight means direct dispatch will succeed.
 */
export async function checkHermesGateway(): Promise<boolean> {
  if (!hermesGatewayUrl) return false;
  try {
    const res = await fetch(`${hermesGatewayUrl}/webhooks/${encodeURIComponent(hermesWebhookName)}`, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(2_500),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

/**
 * List Hermes profiles from the local dashboard. Throwing (unreachable or
 * unconfigured) means the panel falls back to the running gateway profile.
 */
export async function fetchHermesProfiles(): Promise<HermesProfile[]> {
  if (!hermesDashboardUrl) throw new Error("Hermes dashboard URL is not configured.");
  const res = await fetch(`${hermesDashboardUrl}/api/profiles`, { credentials: "include" });
  if (!res.ok) throw new Error(`Hermes profiles failed (${res.status})`);
  const payload = (await res.json()) as { profiles?: Array<Record<string, unknown>> };
  return (payload.profiles ?? [])
    .filter((profile) => typeof profile.name === "string" && profile.name)
    .map((profile) => ({
      name: profile.name as string,
      isDefault: profile.is_default === true,
      model: typeof profile.model === "string" ? profile.model : null,
      provider: typeof profile.provider === "string" ? profile.provider : null,
      gatewayRunning: profile.gateway_running === true,
      description: typeof profile.description === "string" ? profile.description : "",
    }));
}

function randomDeliveryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `intellizen-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function hmacSha256Hex(secret: string, body: string) {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function workflowPayload(input: AgentWorkflowInput) {
  return {
    source: "intelizen",
    kind: "workflow",
    workflow_id: input.workflowId,
    task: input.task,
    context: input.context,
    config: input.config ?? {},
    prompt: input.prompt ?? null,
    priority: input.priority ?? "normal",
  };
}

function agentChatPayload(input: AgentChatInput & { message: string }) {
  return {
    source: "intelizen",
    kind: "chat_message",
    action: "send_message",
    target_agent: input.targetAgent,
    profile: input.profile ?? null,
    message: input.message,
    submit: input.submit ?? true,
    context: input.context,
    priority: input.priority ?? "normal",
  };
}

async function enqueueFionaInbox(input: {
  task: string;
  payload: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
}) {
  const { data, error } = await supabase
    .schema("comms").from("fiona_inbox")
    .insert([
      {
        from_agent: "intelizen",
        task: input.task,
        context: input.payload,
        priority: input.priority ?? "normal",
        status: "pending",
      },
    ])
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function submitHermesPayload(input: {
  event: "intellizen.workflow" | "intellizen.chat";
  payload: Record<string, unknown>;
  profile?: string | null;
}) {
  if (!hermesGatewayUrl) {
    throw new Error("Hermes gateway URL is not configured.");
  }

  const body = JSON.stringify(input.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-GitHub-Event": input.event,
    "X-GitHub-Delivery": randomDeliveryId(),
  };
  if (hermesWebhookSecret) {
    headers["X-Hub-Signature-256"] = `sha256=${await hmacSha256Hex(hermesWebhookSecret, body)}`;
  }

  // Profile-scoped route when a Hermes profile is selected; default route
  // otherwise. Both are supported by the Hermes webhook adapter.
  const routePath = input.profile
    ? `/p/${encodeURIComponent(input.profile)}/webhooks/${encodeURIComponent(hermesWebhookName)}`
    : `/webhooks/${encodeURIComponent(hermesWebhookName)}`;
  const res = await fetch(
    `${hermesGatewayUrl}${routePath}`,
    {
      method: "POST",
      headers,
      body,
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Hermes webhook failed (${res.status}): ${detail || res.statusText}`);
  }

  return (await res.json()) as {
    message_id?: string;
    messageId?: string;
    delivery_id?: string;
    deliveryId?: string;
  };
}

function dispatchErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Dispatch a workflow through the API server run queue (/v1/runs). */
async function submitHermesRun(payload: Record<string, unknown>): Promise<string> {
  if (!hermesApiUrl || !hermesApiKey) throw new Error("Hermes API is not configured.");
  const res = await fetch(`${hermesApiUrl}/v1/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hermesApiKey}`,
    },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      input: `IntelliZen workflow dispatch. Follow the payload's prompt and context; keep writes bounded to the referenced workflow_run_id and linked records; append receipts for every state change; request approval before anything external-facing or irreversible.\n\nPayload:\n${JSON.stringify(payload, null, 2)}`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Hermes run submit failed (${res.status}): ${detail || res.statusText}`);
  }
  const body = (await res.json()) as { run_id?: string; id?: string };
  return body.run_id ?? body.id ?? "run-accepted";
}

export async function submitWorkflow(input: AgentWorkflowInput): Promise<AgentSubmission> {
  const payload = workflowPayload(input);
  // Preferred transport: API server run queue (has CORS + receipts via
  // Fiona's runtime). Webhook second, durable inbox last.
  try {
    const runId = await submitHermesRun(payload);
    return { status: "submitted", messageId: runId };
  } catch (apiError) {
    console.warn(`Hermes /v1/runs dispatch unavailable, trying webhook: ${dispatchErrorMessage(apiError)}`);
  }
  try {
    const result = await submitHermesPayload({ event: "intellizen.workflow", payload });
    return {
      status: "submitted",
      messageId: result.message_id ?? result.messageId ?? result.delivery_id ?? result.deliveryId,
    };
  } catch (error) {
    const dispatchError = dispatchErrorMessage(error);
    console.warn(`Hermes workflow dispatch failed, queuing to Fiona inbox: ${dispatchError}`);
    const inboxItemId = await enqueueFionaInbox({
      task: input.task,
      payload: { ...payload, dispatch_error: dispatchError },
      priority: input.priority,
    });
    return { status: "queued", inboxItemId, dispatchError };
  }
}

export async function sendToAgentChat(input: AgentChatInput): Promise<AgentSubmission> {
  const message = input.message.trim();
  if (!message) throw new Error("Message is required.");
  if (input.submit === false) {
    throw new Error("Draft-only agent chat messages are not supported yet.");
  }

  const payload = agentChatPayload({ ...input, message });
  try {
    const result = await submitHermesPayload({ event: "intellizen.chat", payload, profile: input.profile });
    return {
      status: "submitted",
      messageId: result.message_id ?? result.messageId ?? result.delivery_id ?? result.deliveryId,
    };
  } catch (error) {
    const dispatchError = dispatchErrorMessage(error);
    console.warn(`Hermes chat dispatch failed, queuing to Fiona inbox: ${dispatchError}`);
    const inboxItemId = await enqueueFionaInbox({
      task: `Direct chat message for ${input.targetAgent}: ${message}`,
      payload: { ...payload, dispatch_error: dispatchError },
      priority: input.priority,
    });
    return { status: "queued", inboxItemId, dispatchError };
  }
}
