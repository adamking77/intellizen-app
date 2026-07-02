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

  const res = await fetch(
    `${hermesGatewayUrl}/webhooks/${encodeURIComponent(hermesWebhookName)}`,
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

export async function submitWorkflow(input: AgentWorkflowInput): Promise<AgentSubmission> {
  const payload = workflowPayload(input);
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
    const result = await submitHermesPayload({ event: "intellizen.chat", payload });
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
