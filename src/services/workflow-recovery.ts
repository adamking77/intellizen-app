import { GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import {
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
} from "@/lib/workflow-schema";
import {
  recoverInterruptedWorkflow,
  type WorkflowRunnerPort,
  type WorkflowStepState,
  type WorkflowTransitionRequest,
} from "@/services/workflow-runner";
import { requiredNonNegativeInteger } from "@/lib/validated-number";

type WorkflowRunRow = {
  id: string;
  fields: Record<string, unknown>;
};

export type WorkflowRecoveryReport = {
  inspected: number;
  abandoned: string[];
  activeLeases: string[];
  durableReconciliation: string[];
  ignored: string[];
  failures: Array<{ runId: string; message: string }>;
};

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing.`);
  }
  return value;
}

function recoveryPort(): Pick<
  WorkflowRunnerPort,
  "newId" | "acquireLease" | "transition" | "releaseLease"
> {
  return {
    newId: () => crypto.randomUUID(),
    acquireLease: async (input) => {
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("acquire_workflow_dispatch_lease", {
          p_workflow_run_id: input.runId,
          p_expected_run_version: input.expectedRunVersion,
          p_dispatcher_session: input.dispatcherSession,
          p_lease_ttl_seconds: 60,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_actor: input.actor,
        });
      if (error) throw new Error(error.message);
      return {
        runVersion: requiredNonNegativeInteger(data?.run_version, "Recovered run version"),
        fencingToken: requiredNonNegativeInteger(data?.fencing_token, "Recovered fencing token"),
      };
    },
    transition: async (input: WorkflowTransitionRequest) => {
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("transition_workflow_step", {
          p_workflow_run_id: input.runId,
          p_expected_run_version: input.expectedRunVersion,
          p_expected_step_id: input.expectedStepId,
          p_expected_step_state: input.expectedStepState,
          p_next_step_id: input.nextStepId,
          p_next_step_state: input.nextStepState,
          p_next_run_status: input.nextRunStatus,
          p_dispatcher_session: input.dispatcherSession,
          p_fencing_token: input.fencingToken,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_actor: input.actor,
          p_event_kind: input.eventKind,
          p_event_summary: input.eventSummary,
          p_event_payload: input.eventPayload,
          p_approval_mutation: input.approvalMutation ?? null,
        });
      if (error) throw new Error(error.message);
      return {
        runVersion: requiredNonNegativeInteger(data?.run_version, "Recovered run version"),
        fencingToken: requiredNonNegativeInteger(data?.fencing_token, "Recovered fencing token"),
      };
    },
    releaseLease: async (input) => {
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("release_workflow_dispatch_lease", {
          p_workflow_run_id: input.runId,
          p_dispatcher_session: input.dispatcherSession,
          p_fencing_token: input.fencingToken,
          p_actor: input.actor,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
        });
      if (error) throw new Error(error.message);
      return {
        runVersion: requiredNonNegativeInteger(data?.run_version, "Released run version"),
      };
    },
  };
}

let launchRecovery: Promise<WorkflowRecoveryReport> | null = null;

/**
 * Main-window launch hook. It only considers schema-v1 runs whose durable
 * snapshot says the current step is still running. Active leases are left
 * untouched; expired local work is fenced and abandoned, while durable work is
 * surfaced for adapter reconciliation.
 */
export function recoverInterruptedLocalWorkflowsOnLaunch() {
  if (launchRecovery) return launchRecovery;
  launchRecovery = (async () => {
    const report: WorkflowRecoveryReport = {
      inspected: 0,
      abandoned: [],
      activeLeases: [],
      durableReconciliation: [],
      ignored: [],
      failures: [],
    };
    const { data, error } = await supabase
      .schema("workspace")
      .from("records")
      .select("id,fields")
      .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns)
      .eq("fields->>run_schema_version", "intellizen.workflow/1")
      .in("fields->>run_status", ["In progress", "Deferred"]);
    if (error) throw new Error(error.message);

    const port = recoveryPort();
    for (const row of (data ?? []) as WorkflowRunRow[]) {
      report.inspected += 1;
      try {
        const fields = row.fields;
        const definition = fields.run_definition_snapshot as WorkflowDefinitionV1;
        const validation = validateWorkflowDefinition(definition);
        if (!validation.valid) {
          throw new Error("Stored workflow definition snapshot is invalid.");
        }
        const currentStepId = requiredString(
          fields.run_current_step_id,
          "Current step ID",
        );
        const stepStates = fields.run_step_states as
          | Record<string, WorkflowStepState>
          | undefined;
        const currentStepState = stepStates?.[currentStepId];
        if (!currentStepState) throw new Error("Current step state is missing.");
        const result = await recoverInterruptedWorkflow(
          {
            runId: row.id,
            runVersion: requiredNonNegativeInteger(fields.run_version, "Run version"),
            currentStepId,
            currentStepState,
            leaseExpiresAt:
              typeof fields.run_lease_expires_at === "string"
                ? fields.run_lease_expires_at
                : null,
            definition,
          },
          {
            actor: "IntelliZen Relaunch Recovery",
            now: new Date().toISOString(),
          },
          port,
        );
        if (result.status === "abandoned") report.abandoned.push(row.id);
        else if (result.status === "reconcile_required") {
          report.durableReconciliation.push(row.id);
        } else if (result.reason === "active_lease") {
          report.activeLeases.push(row.id);
        } else {
          report.ignored.push(row.id);
        }
      } catch (runError) {
        report.failures.push({
          runId: row.id,
          message:
            runError instanceof Error
              ? runError.message
              : "Unknown workflow recovery error.",
        });
      }
    }
    return report;
  })();
  void launchRecovery.catch(() => {
    launchRecovery = null;
  });
  return launchRecovery;
}
