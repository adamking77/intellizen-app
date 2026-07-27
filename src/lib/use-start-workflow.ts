import { useState } from "react";

import { OPERATOR_ACTOR, startWorkflow } from "@/lib/data";
import type { StartWorkflowInput } from "@/lib/types";
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

  async function start(request: StartWorkflowRequest) {
    if (isStartingWorkflow) return null;
    try {
      setIsStartingWorkflow(true);
      const result = await startWorkflow({
        ...request,
        requestedBy: request.requestedBy ?? OPERATOR_ACTOR,
        confirmWrite: true,
      });
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
          const dispatch = await dispatchWorkflowRun(result.run);
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
            "Workflow Run created, but dispatch did not start",
            dispatchError,
          );
        }
      }
      await options.onStarted?.();
      return returned;
    } catch (startError) {
      toastError("Workflow start failed", startError);
      return null;
    } finally {
      setIsStartingWorkflow(false);
    }
  }

  return { isStartingWorkflow, start };
}
