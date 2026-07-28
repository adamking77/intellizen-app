import { describe, expect, it } from "vitest";

import {
  applyTeamReviewFixture,
  buildAgentCreationPreview,
  workflowTargetRoles,
} from "@/lib/team-roster";
import type { WorkflowTemplateItem } from "@/lib/types";

describe("team roster composition", () => {
  it("applies a local review assignment without mutating canonical records", () => {
    const canonical = [
      {
        id: "assignment-live",
        fields: {
          role_assignment_role: ["role-verifier"],
          role_assignment_agent: ["agent-old"],
          role_assignment_status: "active",
        },
      },
    ];
    const composed = applyTeamReviewFixture(canonical, {
      roleRecordId: "role-verifier",
      agentRecordId: "agent-keel",
      bindingRef: "codex-local-primary",
      scope: "Verification fixture",
      confirmedAt: "2026-07-28T00:00:00.000Z",
    });
    expect(canonical[0].fields.role_assignment_agent).toEqual(["agent-old"]);
    expect(composed).toHaveLength(1);
    expect(composed[0]).toMatchObject({
      id: "local-review-fixture:role-verifier",
      fields: { role_assignment_agent: ["agent-keel"] },
    });
  });

  it("extracts role and approval targets only from schema-v1 workflows", () => {
    const workflow = {
      definition: {
        schema: "intellizen.workflow/1",
        steps: [
          { kind: "role-assign", role: "verifier" },
          { kind: "approval", gate: "founder_approval_authority" },
        ],
      },
    } as WorkflowTemplateItem;
    expect(workflowTargetRoles(workflow)).toEqual([
      "verifier",
      "founder_approval_authority",
    ]);
  });

  it("previews draft records and local references before any write", () => {
    const preview = buildAgentCreationPreview({
      name: "Test Agent",
      key: "test_agent",
      purpose: "Bounded test fixture.",
      mandate: "Verify.",
      boundaries: "No external actions.",
      ownerGate: "owner-only",
      bindingRef: "claude-local-primary",
      roleRecordId: "role-verifier",
      scope: "Test only",
    });
    expect(preview.agent.fields.agent_status).toBe("draft");
    expect(preview.assignment?.fields.role_assignment_status).toBe("draft");
    expect(preview.localChanges[0]).toContain("do not copy executable arguments");
  });
});
