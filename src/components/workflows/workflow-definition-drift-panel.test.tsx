import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowDefinitionDriftPanel } from "@/components/workflows/workflow-definition-drift-panel";
import type {
  WorkflowDefinitionDrift,
  WorkflowDriftResolution,
} from "@/lib/workflow-definition-drift";

const drift: WorkflowDefinitionDrift = {
  state: "drifted",
  runHash: "snapshot-hash",
  currentHash: "registry-hash",
  runVersion: 2,
  currentVersion: 3,
};

function renderedResolution(
  response: WorkflowDriftResolution["response"],
): WorkflowDriftResolution {
  if (response === "clone-definition") {
    return {
      response,
      mutation: "new-definition-draft",
      message: `Resolved through ${response}`,
      definition: {
        schema: "intellizen.workflow/1",
        id: "proof",
        name: "Proof",
        version: 4,
        trigger: { kind: "manual" },
        inputs: [],
        steps: [],
      },
    };
  }
  if (response === "reviewed-migration") {
    return {
      response,
      mutation: "create-replacement-run",
      message: `Resolved through ${response}`,
      sourceRunId: "run-1",
      sourceHash: "snapshot-hash",
      targetHash: "registry-hash",
    };
  }
  return {
    response,
    mutation: "none",
    message: `Resolved through ${response}`,
  };
}

describe("WorkflowDefinitionDriftPanel", () => {
  it("renders all four explicit safe responses", () => {
    const markup = renderToStaticMarkup(
      <WorkflowDefinitionDriftPanel
        drift={drift}
        resolution={null}
        onResolve={vi.fn()}
      />,
    );
    expect(markup).toContain("Preserve snapshot");
    expect(markup).toContain("Clone as v4");
    expect(markup).toContain("Review migration");
    expect(markup).toContain("Reject upgrade");
    expect(markup).toContain("will not be upgraded implicitly");
  });

  it.each([
    "preserve-snapshot",
    "clone-definition",
    "reviewed-migration",
    "reject-upgrade",
  ] as const)("renders the %s resolution receipt", (response) => {
    const markup = renderToStaticMarkup(
      <WorkflowDefinitionDriftPanel
        drift={drift}
        resolution={renderedResolution(response)}
        onResolve={vi.fn()}
      />,
    );
    expect(markup).toContain(`data-resolution="${response}"`);
  });
});
