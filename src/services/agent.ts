import { supabase } from "@/lib/supabase";
import { hermesDashboardConfigured, hermesDashboardFetch } from "@/services/voice";
import type { GraphEntityType } from "@/lib/types";
import {
  checkHermesHostApi,
  checkHermesHostGateway,
  getHermesHostRunStatus,
  startHermesHostRun,
  streamHermesHostChat,
  submitHermesHostGateway,
} from "@/services/hermes-host";

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

/** True when the streaming chat API is configured and reachable. */
export async function checkHermesApi(): Promise<boolean> {
  try {
    return await checkHermesHostApi();
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

export interface HermesRunExecution {
  runId: string;
  output: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  } | null;
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
  systemPrompt?: string;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}): Promise<HermesStreamResult> {
  return streamHermesHostChat(input);
}

export async function executeHermesRun(input: {
  prompt: string;
  instructions: string;
  timeoutMs: number;
}): Promise<HermesRunExecution> {
  const started = await startHermesHostRun({
    prompt: input.prompt,
    instructions: input.instructions,
  });

  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const status = await getHermesHostRunStatus(started.runId);
    if (status.status === "completed") {
      return {
        runId: started.runId,
        output: status.output ?? "",
        usage: status.usage
          ? {
              inputTokens: status.usage.inputTokens,
              outputTokens: status.usage.outputTokens,
            }
          : null,
      };
    }
    if (
      status.status &&
      ["failed", "cancelled", "waiting_for_approval"].includes(status.status)
    ) {
      throw new Error(
        `Hermes run ended as ${status.status}: ${status.error ?? "no detail"}`,
      );
    }
  }
  throw new Error("Hermes run did not reach a terminal state before timeout.");
}

/**
 * Health-check the Hermes webhook gateway — the transport chat actually
 * uses. A 2xx on the CORS preflight means direct dispatch will succeed.
 */
export async function checkHermesGateway(): Promise<boolean> {
  try {
    return await checkHermesHostGateway();
  } catch {
    return false;
  }
}

/**
 * List Hermes profiles from the local dashboard. Throwing (unreachable or
 * unconfigured) means the panel falls back to the running gateway profile.
 */
export async function fetchHermesProfiles(): Promise<HermesProfile[]> {
  if (!hermesDashboardConfigured()) throw new Error("Hermes dashboard URL is not configured.");
  const res = await hermesDashboardFetch("/api/profiles");
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
  return (await submitHermesHostGateway({
    event: input.event,
    payload: input.payload,
    profile: input.profile,
    deliveryId: randomDeliveryId(),
  })) as {
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
  const run = await startHermesHostRun({
    prompt: `IntelliZen workflow dispatch. Follow the payload's prompt and context; keep writes bounded to the referenced workflow_run_id and linked records; append receipts for every state change; request approval before anything external-facing or irreversible.\n\nPayload:\n${JSON.stringify(payload, null, 2)}`,
  });
  return run.runId;
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
