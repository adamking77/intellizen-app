import { supabase } from "@/lib/supabase";

export const WORKFLOW_TRANSITION_CONTINUATION_SCHEMA =
  "intellizen.workflow-transition-continuation/1" as const;

export type WorkflowExecutionIdentity = {
  executionVersion: number;
  definitionHash: string;
};

export type WorkflowTransitionContinuationPayload = {
  schema: typeof WORKFLOW_TRANSITION_CONTINUATION_SCHEMA;
  executionVersion: number;
  definitionHash: string;
  stepResult: unknown;
};

export type WorkflowRunContinuation = {
  identity: WorkflowExecutionIdentity;
  definitionSnapshot: unknown;
  runVersion: number;
  currentStepId: string | null;
  stepStates: Record<string, unknown>;
  stepResults: Record<string, unknown>;
};

const INCOMPLETE_HISTORY_MESSAGE =
  "This run has incomplete saved execution history and cannot safely resume. Review its recorded work before starting another run.";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return Number(value);
}

export async function loadWorkflowRunContinuation(
  workflowRunId: string,
): Promise<WorkflowRunContinuation> {
  const { data, error } = await supabase
    .schema("workspace")
    .rpc("get_workflow_run_continuation_v1", {
      p_workflow_run_id: workflowRunId,
    });
  if (error) throw new Error(error.message);
  const continuation = objectValue(data);
  const run = objectValue(continuation?.run);
  const execution = objectValue(continuation?.execution);
  const receipts = objectValue(continuation?.stepResults);
  if (
    continuation?.schema !== "intellizen.workflow-run-continuation/1" ||
    continuation.continuationStatus !== "ready" ||
    execution?.workflowRunId !== workflowRunId ||
    run?.workflowRunId !== workflowRunId ||
    !run ||
    !receipts
  ) {
    throw new Error(INCOMPLETE_HISTORY_MESSAGE);
  }
  const executionVersion = requiredInteger(
    execution.executionVersion,
    "Workflow execution version",
  );
  if (executionVersion <= 0) {
    throw new Error("Workflow execution version is invalid.");
  }
  const definitionHash = typeof execution.definitionHash === "string"
    && /^[a-f0-9]{64}$/.test(execution.definitionHash)
    ? execution.definitionHash
    : null;
  if (!definitionHash) throw new Error("Workflow definition hash is invalid.");
  if (
    requiredInteger(run.runExecutionVersion, "Workflow run execution version")
      !== executionVersion
  ) {
    throw new Error("Workflow execution identity does not match the saved run.");
  }
  const stepResults = Object.fromEntries(
    Object.entries(receipts).map(([stepId, value]) => {
      const receipt = objectValue(value);
      if (
        !receipt || !("result" in receipt) || receipt.stepId !== stepId ||
        receipt.workflowRunId !== workflowRunId ||
        receipt.executionVersion !== executionVersion ||
        receipt.definitionHash !== definitionHash
      ) {
        throw new Error(INCOMPLETE_HISTORY_MESSAGE);
      }
      return [stepId, receipt.result];
    }),
  );
  const stepStates = objectValue(run.runStepStates) ?? {};
  for (const [stepId, state] of Object.entries(stepStates)) {
    if (state === "completed" && !(stepId in stepResults)) {
      throw new Error(INCOMPLETE_HISTORY_MESSAGE);
    }
  }
  return {
    identity: { executionVersion, definitionHash },
    definitionSnapshot: execution.definitionSnapshot,
    runVersion: requiredInteger(run.runVersion, "Workflow run version"),
    currentStepId:
      typeof run.runCurrentStepId === "string" ? run.runCurrentStepId : null,
    stepStates,
    stepResults,
  };
}

export function attachWorkflowTransitionContinuation<
  T extends {
    expectedStepId: string;
    nextStepId: string;
    nextStepState: string;
    eventPayload: Record<string, unknown>;
  },
>(
  transition: T,
  identity: WorkflowExecutionIdentity,
): Omit<T, "eventPayload"> & {
  eventPayload: T["eventPayload"] & {
    _continuation: WorkflowTransitionContinuationPayload;
  };
} {
  if ("_continuation" in transition.eventPayload) {
    throw new Error("_continuation is reserved for the workflow runtime.");
  }
  const completesStep = transition.expectedStepId === transition.nextStepId
    && transition.nextStepState === "completed";
  const continuation: WorkflowTransitionContinuationPayload = {
    schema: WORKFLOW_TRANSITION_CONTINUATION_SCHEMA,
    executionVersion: identity.executionVersion,
    definitionHash: identity.definitionHash,
    stepResult: completesStep && "result" in transition.eventPayload
      ? transition.eventPayload.result
      : null,
  };
  return {
    ...transition,
    eventPayload: {
      ...transition.eventPayload,
      _continuation: continuation,
    },
  };
}
