import { useRef, useState } from "react";

import { OPERATOR_ACTOR, startWorkflow } from "@/lib/data";
import type { StartWorkflowInput, WorkflowStartAttempt } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { dispatchWorkflowRun } from "@/services/workflow-dispatch";

type StartWorkflowRequest = Omit<StartWorkflowInput, "requestedBy" | "confirmWrite"> & {
  requestedBy?: string;
};

/**
 * Shared UI entry point for starting Workflow Runs. Every launcher goes
 * through here so attribution, confirm-write, and result toasts stay
 * consistent across the Agent Panel and record peek panels.
 */
export function useStartWorkflow(options: { onStarted?: () => Promise<unknown> | void } = {}) {
  const [isStartingWorkflow, setIsStartingWorkflow] = useState(false);
  const dispatchControllerRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const pendingAttemptRef = useRef<{
    request: string;
    attempt: WorkflowStartAttempt;
  } | null>(null);

  async function start(request: StartWorkflowRequest) {
    if (startingRef.current) return null;
    startingRef.current = true;
    try {
      setIsStartingWorkflow(true);
      const startInput = {
        ...request,
        requestedBy: request.requestedBy ?? OPERATOR_ACTOR,
      };
      const requestKey = JSON.stringify(startInput);
      let startAttempt = pendingAttemptRef.current?.request === requestKey
        ? pendingAttemptRef.current.attempt
        : null;
      if (!startAttempt) {
        const preview = await startWorkflow({ ...startInput, confirmWrite: false });
        const confirmation = "schema_v1" in preview
          ? (preview.schema_v1 as { confirmation?: { start_attempt?: WorkflowStartAttempt } | null } | null)?.confirmation
          : undefined;
        startAttempt = confirmation?.start_attempt ?? null;
        if (startAttempt) pendingAttemptRef.current = { request: requestKey, attempt: startAttempt };
      }
      const result = await startWorkflow({
        ...startInput,
        confirmWrite: true,
        ...(startAttempt ? { startAttempt } : {}),
      });
      pendingAttemptRef.current = null;
      const runName = "run" in result && result.run ? result.run.name : undefined;
      const runId = "workflow_run_id" in result ? result.workflow_run_id : undefined;
      toast.success("Workflow run created", { description: runName ?? runId });
      let returned = result;
      if (
        "workflow_run_id" in result &&
        result.workflow_run_id &&
        result.run?.schema_version === "intellizen.workflow/1"
      ) {
        try {
          const controller = new AbortController();
          dispatchControllerRef.current = controller;
          const dispatch = await dispatchWorkflowRun(result.run, controller.signal);
          if (dispatch) {
            const currentStep =
              dispatch.status === "needs_approval"
                ? "Paused at an exact payload-bound approval"
                : dispatch.status === "completed"
                  ? "Workflow completed"
                  : "Workflow blocked";
            returned = {
              ...result,
              status: dispatch.status,
              current_step: currentStep,
            };
            toast.success(
              dispatch.status === "needs_approval"
                ? "Workflow needs approval"
                : dispatch.status === "completed"
                  ? "Workflow completed"
                  : "Workflow blocked",
              { description: runName ?? runId },
            );
          }
        } catch (dispatchError) {
          toastError(
            "Workflow run needs attention",
            dispatchError,
          );
        }
      }
      try {
        await options.onStarted?.();
      } catch (refreshError) {
        toastError("Workflow run created, but the view could not refresh", refreshError);
      }
      return returned;
    } catch (startError) {
      toastError("Workflow start failed", startError);
      return null;
    } finally {
      dispatchControllerRef.current = null;
      startingRef.current = false;
      setIsStartingWorkflow(false);
    }
  }

  return {
    isStartingWorkflow,
    start,
    cancel: () => dispatchControllerRef.current?.abort(),
  };
}
