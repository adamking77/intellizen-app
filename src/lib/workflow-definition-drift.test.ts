import { describe, expect, it } from "vitest";

import {
  inspectWorkflowDefinitionDrift,
  resolveWorkflowDefinitionDrift,
  type WorkflowDriftResponse,
} from "@/lib/workflow-definition-drift";
import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";

const runDefinition: WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1",
  id: "proof",
  name: "Proof",
  version: 2,
  trigger: { kind: "manual" },
  inputs: [],
  steps: [
    {
      id: "draft",
      kind: "decision",
      title: "Draft",
      rationale: "Record the evidence.",
      next: "complete",
    },
  ],
};

const drift = inspectWorkflowDefinitionDrift({
  runDefinition,
  currentDefinition: { ...runDefinition, version: 3 },
  runHash: "snapshot-hash",
  currentHash: "registry-hash",
});

describe("workflow definition drift", () => {
  it("distinguishes current identity, drift, and unavailable identity", () => {
    expect(drift).toMatchObject({
      state: "drifted",
      runVersion: 2,
      currentVersion: 3,
    });
    expect(
      inspectWorkflowDefinitionDrift({
        runDefinition,
        currentDefinition: runDefinition,
        runHash: "same",
        currentHash: "same",
      }).state,
    ).toBe("current");
    expect(
      inspectWorkflowDefinitionDrift({
        runDefinition,
        currentDefinition: runDefinition,
        runHash: null,
        currentHash: "current",
      }),
    ).toEqual({
      state: "unavailable",
      reason: "missing-definition-identity",
    });
  });

  it.each([
    ["preserve-snapshot", "none"],
    ["clone-definition", "new-definition-draft"],
    ["reviewed-migration", "create-replacement-run"],
    ["reject-upgrade", "none"],
  ] as Array<[WorkflowDriftResponse, string]>)(
    "implements %s without mutating the historical run",
    (response, mutation) => {
      const resolution = resolveWorkflowDefinitionDrift({
        drift,
        response,
        runId: "run-1",
        runDefinition,
      });
      expect(resolution.mutation).toBe(mutation);
      if (resolution.response === "clone-definition") {
        expect(resolution.definition.version).toBe(2);
        expect(runDefinition.version).toBe(2);
      }
      if (resolution.response === "reviewed-migration") {
        expect(resolution).toMatchObject({
          sourceRunId: "run-1",
          sourceHash: "snapshot-hash",
          targetHash: "registry-hash",
        });
      }
    },
  );
});
