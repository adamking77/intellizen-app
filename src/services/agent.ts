import { supabase } from "@/lib/supabase";
import type { GraphEntityType, InvestigationUseCase } from "@/lib/types";

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

export interface AgentSubmission {
  status: "submitted" | "queued";
  messageId?: string;
  inboxItemId?: string;
}

export interface GraphExtractionOutput {
  entities: Array<{ label: string; type: GraphEntityType }>;
  relationships: Array<{ source: string; target: string; relation: string }>;
}

export class AgentWorkflowQueuedError extends Error {
  inboxItemId?: string;
  messageId?: string;

  constructor(input: { inboxItemId?: string; messageId?: string }) {
    super("Fiona has accepted this workflow. Results will be written back to existing IntelliZen tables.");
    this.name = "AgentWorkflowQueuedError";
    this.inboxItemId = input.inboxItemId;
    this.messageId = input.messageId;
  }
}

const hermesGatewayUrl =
  import.meta.env.VITE_HERMES_GATEWAY_URL?.replace(/\/$/, "") ||
  "https://hermes-agent-production-c98b.up.railway.app";
const hermesWebhookName = import.meta.env.VITE_HERMES_WEBHOOK_NAME || "intellizen";
const hermesWebhookSecret = import.meta.env.VITE_HERMES_WEBHOOK_SECRET || "";

function workflowPayload(input: AgentWorkflowInput) {
  return {
    source: "intelizen",
    workflow_id: input.workflowId,
    task: input.task,
    context: input.context,
    config: input.config ?? {},
    prompt: input.prompt ?? null,
    priority: input.priority ?? "normal",
  };
}

async function enqueueFionaWorkflow(input: AgentWorkflowInput) {
  const payload = workflowPayload(input);
  const { data, error } = await supabase
    .from("fiona_inbox")
    .insert([
      {
        from_agent: "intelizen",
        task: input.task,
        context: payload,
        priority: input.priority ?? "normal",
        status: "pending",
      },
    ])
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function submitHermesWebhook(input: AgentWorkflowInput) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (hermesWebhookSecret) headers["X-Gitlab-Token"] = hermesWebhookSecret;

  const res = await fetch(
    `${hermesGatewayUrl}/webhooks/${encodeURIComponent(hermesWebhookName)}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(workflowPayload(input)),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Hermes webhook failed (${res.status}): ${detail || res.statusText}`);
  }

  return (await res.json()) as { message_id?: string; messageId?: string };
}

export async function submitWorkflow(input: AgentWorkflowInput): Promise<AgentSubmission> {
  try {
    const result = await submitHermesWebhook(input);
    return {
      status: "submitted",
      messageId: result.message_id ?? result.messageId,
    };
  } catch {
    const inboxItemId = await enqueueFionaWorkflow(input);
    return { status: "queued", inboxItemId };
  }
}

export async function queueInvestigationAnalysis(input: {
  useCase: InvestigationUseCase;
  caseId: string;
  investigationId: number;
  subject: string;
  prompt: string;
}) {
  const result = await submitWorkflow({
    workflowId: "run-investigation-analysis",
    task: `Run ${input.useCase} analysis for investigation ${input.caseId}. Hermes/Fiona owns execution and may call Claude for bounded specialist review.`,
    context: {
      type: "investigation",
      id: input.investigationId,
      payload: {
        case_id: input.caseId,
        use_case: input.useCase,
        subject: input.subject,
      },
    },
    priority: "normal",
    prompt: input.prompt,
  });

  throw new AgentWorkflowQueuedError(result);
}

export async function queueGraphExtraction(input: {
  projectId: number;
  prompt: string;
  signalCount: number;
}) {
  const result = await submitWorkflow({
    workflowId: "extract-graph",
    task: `Extract graph entities and relationships for project ${input.projectId}. Write graph_nodes and graph_edges, or return strict graph JSON if running in request mode.`,
    context: {
      type: "project-graph",
      id: input.projectId,
      payload: {
        project_id: input.projectId,
        signal_count: input.signalCount,
      },
    },
    priority: "normal",
    prompt: input.prompt,
  });

  throw new AgentWorkflowQueuedError(result);
}
