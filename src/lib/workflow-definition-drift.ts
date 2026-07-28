import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";

export type WorkflowDefinitionDrift =
  | {
      state: "unavailable";
      reason:
        | "missing-run-snapshot"
        | "missing-current-definition"
        | "missing-definition-identity";
    }
  | {
      state: "current";
      runHash: string;
      currentHash: string;
    }
  | {
      state: "drifted";
      runHash: string;
      currentHash: string;
      runVersion: number;
      currentVersion: number;
    };

export type WorkflowDriftResponse =
  | "preserve-snapshot"
  | "clone-definition"
  | "reviewed-migration"
  | "reject-upgrade";

export type WorkflowDriftResolution =
  | {
      response: "preserve-snapshot";
      mutation: "none";
      message: string;
    }
  | {
      response: "clone-definition";
      mutation: "new-definition-draft";
      definition: WorkflowDefinitionV1;
      message: string;
    }
  | {
      response: "reviewed-migration";
      mutation: "create-replacement-run";
      sourceRunId: string;
      sourceHash: string;
      targetHash: string;
      message: string;
    }
  | {
      response: "reject-upgrade";
      mutation: "none";
      message: string;
    };

export function inspectWorkflowDefinitionDrift(input: {
  runDefinition: WorkflowDefinitionV1 | null;
  currentDefinition: WorkflowDefinitionV1 | null;
  runHash: string | null;
  currentHash: string | null;
}): WorkflowDefinitionDrift {
  if (!input.runDefinition) {
    return { state: "unavailable", reason: "missing-run-snapshot" };
  }
  if (!input.currentDefinition) {
    return { state: "unavailable", reason: "missing-current-definition" };
  }
  if (!input.runHash || !input.currentHash) {
    return { state: "unavailable", reason: "missing-definition-identity" };
  }
  if (input.runHash === input.currentHash) {
    return {
      state: "current",
      runHash: input.runHash,
      currentHash: input.currentHash,
    };
  }
  return {
    state: "drifted",
    runHash: input.runHash,
    currentHash: input.currentHash,
    runVersion: input.runDefinition.version,
    currentVersion: input.currentDefinition.version,
  };
}

export function resolveWorkflowDefinitionDrift(input: {
  drift: WorkflowDefinitionDrift;
  response: WorkflowDriftResponse;
  runId: string;
  runDefinition: WorkflowDefinitionV1;
}): WorkflowDriftResolution {
  if (input.drift.state !== "drifted") {
    throw new Error("Definition drift must be present before it can be resolved.");
  }
  if (input.response === "preserve-snapshot") {
    return {
      response: input.response,
      mutation: "none",
      message: "This run remains pinned to its immutable definition snapshot.",
    };
  }
  if (input.response === "reject-upgrade") {
    return {
      response: input.response,
      mutation: "none",
      message: "Implicit upgrade rejected. No definition or run was changed.",
    };
  }
  if (input.response === "clone-definition") {
    return {
      response: input.response,
      mutation: "new-definition-draft",
      definition: structuredClone(input.runDefinition),
      message:
        "A Registry draft was prepared from the run snapshot; save assigns the next current version.",
    };
  }
  return {
    response: input.response,
    mutation: "create-replacement-run",
    sourceRunId: input.runId,
    sourceHash: input.drift.runHash,
    targetHash: input.drift.currentHash,
    message:
      "Migration requires a reviewed replacement run; the historical run remains unchanged.",
  };
}
