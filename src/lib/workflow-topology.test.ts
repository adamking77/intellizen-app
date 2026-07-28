import { describe, expect, it } from "vitest";

import { buildWorkflowTopology } from "@/lib/workflow-topology";
import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";

const definition: WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1",
  id: "topology-proof",
  name: "Topology proof",
  version: 1,
  trigger: { kind: "manual" },
  inputs: [],
  steps: [
    {
      id: "build",
      kind: "role-assign",
      title: "Build",
      role: "chief_engineer",
      resolution: "primary-active-occupant",
      instructions: "Build.",
      execution: "ephemeral",
      verification: { required: false },
      timeoutMinutes: 30,
      next: "check",
    },
    {
      id: "check",
      kind: "condition",
      title: "Check",
      expr: "steps.build.state == 'completed'",
      then: "approve",
      else: "blocked",
    },
    {
      id: "approve",
      kind: "approval",
      title: "Approve",
      gate: "founder_approval_authority",
      payloadRef: "steps.build.result",
      next: "complete",
    },
  ],
};

describe("workflow topology", () => {
  it("keeps node and edge identity identical across definition, dry-run, and run", () => {
    const definitionGraph = buildWorkflowTopology({ definition });
    const dryRunGraph = buildWorkflowTopology({
      definition,
      mode: "dry-run",
      dryRun: {
        valid: true,
        errors: [],
        dispatches: false,
        sequence: [],
        approvals: [],
      },
    });
    const runGraph = buildWorkflowTopology({
      definition,
      mode: "run",
      run: null,
    });
    expect(dryRunGraph.nodes.map((node) => node.id)).toEqual(
      definitionGraph.nodes.map((node) => node.id),
    );
    expect(runGraph.edges.map((edge) => edge.id)).toEqual(
      definitionGraph.edges.map((edge) => edge.id),
    );
  });

  it("renders true and false branches plus explicit terminal nodes", () => {
    const graph = buildWorkflowTopology({ definition });
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "step:check",
          target: "step:approve",
          sourceHandle: "then",
          label: "true",
        }),
        expect.objectContaining({
          source: "step:check",
          target: "terminal:blocked",
          sourceHandle: "else",
          label: "false",
        }),
      ]),
    );
    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["trigger", "terminal:complete", "terminal:blocked"]),
    );
  });
});
