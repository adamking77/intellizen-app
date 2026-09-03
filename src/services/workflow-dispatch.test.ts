import { describe, expect, it } from "vitest";

import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";
import { assertProductionWorkflowArtifacts } from "./workflow-dispatch";

function definitionWithAction(
  action: "create-doc" | "simulate-consequential-action",
): WorkflowDefinitionV1 {
  return {
    schema: "intellizen.workflow/1",
    id: `production-${action}`,
    name: "Production dispatcher artifact contract",
    version: 1,
    trigger: { kind: "manual" },
    inputs: [],
    steps: [
      {
        id: "artifact",
        kind: "artifact",
        title: "Artifact",
        action,
        template: "internal",
        payloadRef: null,
        next: null,
      },
    ],
  };
}

describe("production workflow dispatch", () => {
  it("permits only the no-external-action simulation artifact", () => {
    expect(() =>
      assertProductionWorkflowArtifacts(
        definitionWithAction("simulate-consequential-action"),
      ),
    ).not.toThrow();
  });

  it("refuses an internal document write without a separate preview and confirmation", () => {
    expect(() =>
      assertProductionWorkflowArtifacts(definitionWithAction("create-doc")),
    ).toThrow("explicit preview and confirm-write");
  });
});
