import { describe, expect, it } from "vitest";

import {
  normalizeCompletedInboxReply,
  normalizeConversationError,
  normalizeLocalActionEvent,
  normalizeQueuedFallback,
  startDirectAssistantText,
  transitionDirectAssistantText,
  type ConversationStreamingEvent,
} from "./agent-conversation";

const T0 = "2026-07-14T08:00:00.000Z";
const T1 = "2026-07-14T08:00:01.000Z";
const T2 = "2026-07-14T08:00:02.000Z";

describe("direct assistant text lifecycle", () => {
  it("transitions deterministically from streaming text to an observed stream end", () => {
    const started = startDirectAssistantText({ id: "event-1", createdAt: T0, correlationId: "turn-1" });
    const first = transitionDirectAssistantText(started, {
      type: "delta",
      text: "Action completed successfully.",
      observedAt: T1,
    }) as ConversationStreamingEvent;

    // Prose is not treated as lifecycle or action evidence.
    expect(first.kind).toBe("streaming");
    expect(first.text).toBe("Action completed successfully.");

    const ended = transitionDirectAssistantText(first, { type: "end", observedAt: T2 });
    expect(ended).toMatchObject({
      version: 1,
      kind: "assistant_text",
      text: "Action completed successfully.",
      completedAt: T2,
      source: "hermes-stream",
      correlationId: "turn-1",
    });
  });

  it("preserves partial text when cancellation is observed", () => {
    const started = startDirectAssistantText({ id: "event-2", createdAt: T0 });
    const partial = transitionDirectAssistantText(started, {
      type: "delta",
      text: "Partial answer",
      observedAt: T1,
    }) as ConversationStreamingEvent;
    const cancelled = transitionDirectAssistantText(partial, { type: "cancel", observedAt: T2 });

    expect(cancelled).toMatchObject({
      kind: "cancelled",
      partialText: "Partial answer",
      cancelledAt: T2,
    });
  });
});

describe("durable inbox observations", () => {
  it("normalizes a completed inbox row as the source for a completed reply", () => {
    const event = normalizeCompletedInboxReply({
      id: "reply-1",
      inboxItemId: "inbox-1",
      text: "Handled.",
      createdAt: T0,
      completedAt: T1,
    });

    expect(event).toMatchObject({
      kind: "assistant_text",
      source: "fiona-inbox",
      correlationId: "inbox-1",
      completedAt: T1,
    });
  });

  it("represents fallback as queued rather than completed", () => {
    const event = normalizeQueuedFallback({
      id: "delivery-1",
      inboxItemId: "inbox-2",
      createdAt: T0,
      actionKind: "workflow",
      label: "Start workflow",
      dispatchError: "Hermes unavailable",
    });

    expect(event).toMatchObject({
      kind: "action",
      state: "queued",
      source: "fiona-inbox",
      correlationId: "inbox-2",
    });
    expect(event.summary).toContain("Hermes unavailable");
    expect(event.evidence).toBeUndefined();
  });
});

describe("local action evidence", () => {
  it("does not infer completion without durable evidence", () => {
    const event = normalizeLocalActionEvent({
      id: "action-1",
      createdAt: T0,
      actionKind: "workflow",
      observedState: "completed",
      label: "Start workflow",
      summary: "The runtime accepted the request.",
      correlation: { correlationId: "delivery-1" },
    });

    expect(event.state).toBe("running");
    expect(event.evidence).toBeUndefined();
  });

  it("accepts completion backed by a canonical workflow run", () => {
    const event = normalizeLocalActionEvent({
      id: "action-2",
      createdAt: T0,
      actionKind: "workflow",
      observedState: "completed",
      label: "Start workflow",
      summary: "Workflow Run created.",
      correlation: {
        correlationId: "run-1",
        workflowRunId: "run-1",
        databaseId: "workflow-runs-db",
        recordId: "run-1",
      },
      evidence: { kind: "workflow_run", id: "run-1" },
    });

    expect(event.state).toBe("completed");
    expect(event.evidence).toEqual({ kind: "workflow_run", id: "run-1" });
    expect(event.canonicalRecord).toEqual({
      databaseId: "workflow-runs-db",
      recordId: "run-1",
    });
  });

  it("describes a newly created canonical record without calling it an append", () => {
    const event = normalizeLocalActionEvent({
      id: "action-created-record",
      createdAt: T0,
      actionKind: "tool",
      observedState: "completed",
      label: "Create task",
      summary: "Task record created.",
      correlation: {
        correlationId: "task-1",
        databaseId: "tasks-db",
        recordId: "task-1",
      },
      evidence: { kind: "record_created", id: "task-1" },
    });

    expect(event.state).toBe("completed");
    expect(event.evidence).toEqual({ kind: "record_created", id: "task-1" });
  });

  it("keeps approval state explicit without claiming a decision", () => {
    const event = normalizeLocalActionEvent({
      id: "action-3",
      createdAt: T0,
      actionKind: "approval",
      observedState: "needs_approval",
      label: "Approval required",
      summary: "Review the canonical Workflow Run.",
      correlation: { correlationId: "run-2" },
    });

    expect(event.state).toBe("needs_approval");
  });
});

describe("errors", () => {
  it("normalizes a recoverable error without inventing durable evidence", () => {
    const event = normalizeConversationError({
      id: "error-1",
      message: "Stream disconnected",
      observedAt: T1,
      correlationId: "turn-9",
    });

    expect(event).toMatchObject({
      version: 1,
      kind: "error",
      message: "Stream disconnected",
      recoverable: true,
      source: "local-ui",
      correlationId: "turn-9",
    });
  });
});
