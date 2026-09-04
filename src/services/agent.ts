import { getGatewayClient } from "@/engine/gateway";
import { defaultProfile, listProfiles, type HermesProfile } from "@/engine/profiles";
import { createSession, submitPrompt } from "@/engine/session";
import type { GraphEntityType } from "@/lib/types";

export type { HermesProfile } from "@/engine/profiles";

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
  /** Hermes profile to run on. Defaults to the profile Hermes marks default. */
  profile?: string | null;
}

export interface AgentSubmission {
  status: "submitted";
  /** The gateway session the prompt was submitted to. */
  messageId: string;
}

export interface GraphExtractionOutput {
  entities: Array<{ label: string; type: GraphEntityType }>;
  relationships: Array<{ source: string; target: string; relation: string }>;
}

/** Hermes profiles, from the connected engine. Throws while it is offline. */
export async function fetchHermesProfiles(): Promise<HermesProfile[]> {
  return listProfiles(getGatewayClient());
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

/** The prompt a workflow dispatch hands the profile. The payload travels
 *  whole so the agent's receipts can name the run and its records. */
export function workflowDispatchPrompt(payload: Record<string, unknown>): string {
  return [
    "IntelliZen workflow dispatch. Follow the payload's prompt and context; keep writes bounded to the referenced workflow_run_id and linked records; append receipts for every state change; request approval before anything external-facing or irreversible.",
    "",
    "Payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

/** Open a session on the profile and submit the prompt without waiting for
 *  the turn. Resolves with the session id. */
async function dispatchThroughGateway(profile: string | null | undefined, prompt: string) {
  const client = getGatewayClient();
  let target = profile?.trim() || null;
  if (!target) {
    const profiles = await listProfiles(client);
    target = defaultProfile(profiles)?.name ?? null;
  }
  if (!target) throw new Error("Hermes listed no profiles to dispatch to.");
  const sessionId = await createSession(client, { profile: target });
  await submitPrompt(client, sessionId, prompt);
  return sessionId;
}

/** Dispatch a workflow to a Hermes profile through the gateway. */
export async function submitWorkflow(input: AgentWorkflowInput): Promise<AgentSubmission> {
  const payload = workflowPayload(input);
  const sessionId = await dispatchThroughGateway(input.profile, workflowDispatchPrompt(payload));
  return { status: "submitted", messageId: sessionId };
}
