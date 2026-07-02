import { useState } from "react";

import { OPERATOR_ACTOR, startWorkflow } from "@/lib/data";
import type { StartWorkflowInput } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";

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
      await options.onStarted?.();
      const runName = "run" in result && result.run ? result.run.name : undefined;
      const runId = "workflow_run_id" in result ? result.workflow_run_id : undefined;
      toast.success("Workflow run started", { description: runName ?? runId });
      return result;
    } catch (startError) {
      toastError("Workflow start failed", startError);
      return null;
    } finally {
      setIsStartingWorkflow(false);
    }
  }

  return { isStartingWorkflow, start };
}
