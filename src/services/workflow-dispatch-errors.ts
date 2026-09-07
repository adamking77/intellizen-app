import { assertPersistenceSafe } from "../../shared/persistence-redaction.mjs";
import type { WorkflowStepState } from "@/services/workflow-runner";

export type WorkflowDispatchFailureReason =
  | "auth_lost"
  | "parent_lost"
  | "orphaned_child"
  | "resume_unsupported"
  | "ambiguous_delivery"
  | "timed_out"
  | "cancelled"
  | "runtime_failed"
  | "persistence_rejected";

export class WorkflowDispatchError extends Error {
  readonly reason: WorkflowDispatchFailureReason;
  readonly retryable: boolean;
  readonly resultKnown: boolean;

  constructor(input: {
    reason: WorkflowDispatchFailureReason;
    message: string;
    retryable?: boolean;
    resultKnown?: boolean;
  }) {
    super(input.message);
    this.name = "WorkflowDispatchError";
    this.reason = input.reason;
    this.retryable = input.retryable ?? false;
    this.resultKnown = input.resultKnown ?? false;
  }
}

function safeFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Runtime dispatch failed.";
  try {
    assertPersistenceSafe({ message });
    return message;
  } catch {
    return "Runtime dispatch failed with redacted unsafe detail.";
  }
}

export function dispatchFailure(error: unknown): WorkflowDispatchError {
  if (error instanceof WorkflowDispatchError) {
    return new WorkflowDispatchError({
      reason: error.reason,
      message: safeFailureMessage(error),
      retryable: error.retryable,
      resultKnown: error.resultKnown,
    });
  }
  if (error instanceof Error && error.message.startsWith("Persistence rejected:")) {
    return new WorkflowDispatchError({
      reason: "persistence_rejected",
      message: "Runtime output was rejected before persistence.",
      resultKnown: false,
    });
  }
  return new WorkflowDispatchError({
    reason: "ambiguous_delivery",
    message: safeFailureMessage(error),
    resultKnown: false,
  });
}

export function failureStepState(
  reason: WorkflowDispatchFailureReason,
): Extract<WorkflowStepState, "abandoned" | "blocked" | "cancelled"> {
  if (reason === "parent_lost" || reason === "orphaned_child") return "abandoned";
  if (reason === "cancelled") return "cancelled";
  return "blocked";
}

export function failureEventKind(reason: WorkflowDispatchFailureReason) {
  if (reason === "timed_out") return "runtime_timed_out";
  if (reason === "cancelled") return "runtime_cancelled";
  if (reason === "parent_lost" || reason === "orphaned_child") return "runtime_abandoned";
  if (reason === "persistence_rejected") return "persistence_rejected";
  return "runtime_blocked";
}
