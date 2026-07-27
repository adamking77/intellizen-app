/**
 * IntelliZen-owned conversation events.
 *
 * The model includes only state the desktop app can observe. Assistant prose is
 * never parsed as proof that an action completed; `completed` action state
 * requires explicit durable evidence.
 */

export const AGENT_CONVERSATION_VERSION = 2 as const;

export type ConversationEventSource =
  | "local-ui"
  | "hermes-stream"
  | "fiona-inbox"
  | "workspace-record"
  | "work-event";

export interface ConversationCorrelation {
  correlationId: string;
  databaseId?: string;
  recordId?: string;
  workflowRunId?: string;
}

export interface ConversationEvidence {
  kind: "record_append" | "record_created" | "workflow_run" | "record_append_plus_work_event";
  id: string;
}

interface ConversationEventBase {
  id: string;
  version: typeof AGENT_CONVERSATION_VERSION;
  createdAt: string;
  source: ConversationEventSource;
  correlationId?: string;
  actorRoleKey: string;
  actorAgentKey: string;
  runtime: ConversationRuntimeIdentity;
}

export interface ConversationRuntimeIdentity {
  adapterId: "mock" | "hermes" | "codex-cli" | "claude-cli" | "gemini-cli";
  bindingRef: string;
  model: string | null;
  execution: "ephemeral" | "durable";
}

export interface ConversationActorIdentity {
  actorRoleKey: string;
  actorAgentKey: string;
  runtime: ConversationRuntimeIdentity;
}

export const FIONA_CONVERSATION_ACTOR: ConversationActorIdentity = {
  actorRoleKey: "operations_director",
  actorAgentKey: "fiona",
  runtime: {
    adapterId: "hermes",
    bindingRef: "hermes-fiona",
    model: null,
    execution: "durable",
  },
};

function eventActor(actor?: ConversationActorIdentity) {
  return actor ?? FIONA_CONVERSATION_ACTOR;
}

export interface ConversationUserMessageEvent extends ConversationEventBase {
  kind: "user_message";
  text: string;
}

export interface ConversationAssistantTextEvent extends ConversationEventBase {
  kind: "assistant_text";
  text: string;
  completedAt: string;
}

export interface ConversationStreamingEvent extends ConversationEventBase {
  kind: "streaming";
  text: string;
  updatedAt: string;
}

export interface ConversationWidgetEvent extends ConversationEventBase {
  kind: "widget";
  /** Kept transport-agnostic so widget validation remains in agent-widgets.ts. */
  widgets: unknown[];
}

export type ConversationActionState =
  | "requested"
  | "running"
  | "queued"
  | "needs_approval"
  | "completed"
  | "failed";

export interface ConversationActionEvent extends ConversationEventBase {
  kind: "action";
  actionKind: "tool" | "workflow" | "approval";
  state: ConversationActionState;
  label: string;
  summary: string;
  canonicalRecord?: { databaseId: string; recordId: string };
  evidence?: ConversationEvidence;
}

export interface ConversationRecordLinkEvent extends ConversationEventBase {
  kind: "record_link";
  label: string;
  canonicalRecord: { databaseId: string; recordId: string };
}

export interface ConversationCancelledEvent extends ConversationEventBase {
  kind: "cancelled";
  partialText: string;
  cancelledAt: string;
}

export interface ConversationErrorEvent extends ConversationEventBase {
  kind: "error";
  message: string;
  recoverable: boolean;
}

export type AgentConversationEvent =
  | ConversationUserMessageEvent
  | ConversationAssistantTextEvent
  | ConversationStreamingEvent
  | ConversationWidgetEvent
  | ConversationActionEvent
  | ConversationRecordLinkEvent
  | ConversationCancelledEvent
  | ConversationErrorEvent;

export type DirectAssistantTextObservation =
  | { type: "delta"; text: string; observedAt: string }
  | { type: "end"; observedAt: string }
  | { type: "cancel"; observedAt: string };

export function startDirectAssistantText(input: {
  id: string;
  createdAt: string;
  correlationId?: string;
  actor?: ConversationActorIdentity;
}): ConversationStreamingEvent {
  return {
    id: input.id,
    version: AGENT_CONVERSATION_VERSION,
    kind: "streaming",
    text: "",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    source: "hermes-stream",
    correlationId: input.correlationId,
    ...eventActor(input.actor),
  };
}

/** Apply one observed SSE lifecycle transition without inspecting response prose. */
export function transitionDirectAssistantText(
  current: ConversationStreamingEvent,
  observation: DirectAssistantTextObservation,
): ConversationStreamingEvent | ConversationAssistantTextEvent | ConversationCancelledEvent {
  if (observation.type === "delta") {
    return {
      ...current,
      text: current.text + observation.text,
      updatedAt: observation.observedAt,
    };
  }

  if (observation.type === "cancel") {
    return {
      id: current.id,
      version: current.version,
      kind: "cancelled",
      partialText: current.text,
      createdAt: current.createdAt,
      cancelledAt: observation.observedAt,
      source: current.source,
      correlationId: current.correlationId,
      actorRoleKey: current.actorRoleKey,
      actorAgentKey: current.actorAgentKey,
      runtime: current.runtime,
    };
  }

  return {
    id: current.id,
    version: current.version,
    kind: "assistant_text",
    text: current.text,
    createdAt: current.createdAt,
    completedAt: observation.observedAt,
    source: current.source,
    correlationId: current.correlationId,
    actorRoleKey: current.actorRoleKey,
    actorAgentKey: current.actorAgentKey,
    runtime: current.runtime,
  };
}

/** A durable inbox reply exists only after the inbox row itself is complete. */
export function normalizeCompletedInboxReply(input: {
  id: string;
  inboxItemId: string;
  text: string;
  createdAt: string;
  completedAt: string;
  actor?: ConversationActorIdentity;
}): ConversationAssistantTextEvent {
  return {
    id: input.id,
    version: AGENT_CONVERSATION_VERSION,
    kind: "assistant_text",
    text: input.text,
    createdAt: input.createdAt,
    completedAt: input.completedAt,
    source: "fiona-inbox",
    correlationId: input.inboxItemId,
    ...eventActor(input.actor),
  };
}

/** A Fiona fallback is a queued action, never a completed action. */
export function normalizeQueuedFallback(input: {
  id: string;
  inboxItemId: string;
  createdAt: string;
  actionKind: ConversationActionEvent["actionKind"];
  label: string;
  dispatchError?: string | null;
  actor?: ConversationActorIdentity;
}): ConversationActionEvent {
  return {
    id: input.id,
    version: AGENT_CONVERSATION_VERSION,
    kind: "action",
    actionKind: input.actionKind,
    state: "queued",
    label: input.label,
    summary: input.dispatchError
      ? `Queued in Fiona inbox after dispatch failed: ${input.dispatchError}`
      : "Queued in Fiona inbox.",
    createdAt: input.createdAt,
    source: "fiona-inbox",
    correlationId: input.inboxItemId,
    ...eventActor(input.actor),
  };
}

/**
 * Normalize app-owned action state. A claimed completion is downgraded to
 * running unless a canonical durable result is supplied as evidence.
 */
export function normalizeLocalActionEvent(input: {
  id: string;
  createdAt: string;
  actionKind: ConversationActionEvent["actionKind"];
  observedState: ConversationActionState;
  label: string;
  summary: string;
  correlation?: ConversationCorrelation;
  evidence?: ConversationEvidence;
  actor?: ConversationActorIdentity;
}): ConversationActionEvent {
  const state = input.observedState === "completed" && !input.evidence
    ? "running"
    : input.observedState;
  const canonicalRecord = input.correlation?.databaseId && input.correlation.recordId
    ? {
        databaseId: input.correlation.databaseId,
        recordId: input.correlation.recordId,
      }
    : undefined;

  return {
    id: input.id,
    version: AGENT_CONVERSATION_VERSION,
    kind: "action",
    actionKind: input.actionKind,
    state,
    label: input.label,
    summary: input.summary,
    canonicalRecord,
    evidence: input.evidence,
    createdAt: input.createdAt,
    source: "local-ui",
    correlationId: input.correlation?.correlationId,
    ...eventActor(input.actor),
  };
}

export function normalizeConversationError(input: {
  id: string;
  message: string;
  observedAt: string;
  source?: ConversationEventSource;
  correlationId?: string;
  recoverable?: boolean;
  actor?: ConversationActorIdentity;
}): ConversationErrorEvent {
  return {
    id: input.id,
    version: AGENT_CONVERSATION_VERSION,
    kind: "error",
    message: input.message,
    recoverable: input.recoverable ?? true,
    createdAt: input.observedAt,
    source: input.source ?? "local-ui",
    correlationId: input.correlationId,
    ...eventActor(input.actor),
  };
}

type WithoutV2Identity<T> = T extends AgentConversationEvent
  ? Omit<T, "version" | "actorRoleKey" | "actorAgentKey" | "runtime"> & {
      version: 1;
    }
  : never;

type LegacyConversationEventV1 = WithoutV2Identity<AgentConversationEvent>;

export function migrateConversationEvent(
  event: AgentConversationEvent | LegacyConversationEventV1,
  fallbackActor: ConversationActorIdentity = FIONA_CONVERSATION_ACTOR,
): AgentConversationEvent {
  if (
    event.version === AGENT_CONVERSATION_VERSION &&
    "actorRoleKey" in event &&
    "actorAgentKey" in event &&
    "runtime" in event
  ) {
    return event;
  }
  return {
    ...event,
    version: AGENT_CONVERSATION_VERSION,
    ...fallbackActor,
  } as AgentConversationEvent;
}
