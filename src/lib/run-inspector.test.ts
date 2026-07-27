import { describe, expect, it } from "vitest";

import { buildRunInspector } from "@/lib/run-inspector";
import type { WorkEventItem } from "@/lib/data";

function event(
  event_kind: string,
  payload: Record<string, unknown>,
): WorkEventItem {
  return {
    id: `${event_kind}-${Math.random()}`,
    record_id: null,
    workflow_run_id: "run-1",
    event_kind,
    actor: "Keel",
    durable_role: null,
    decision_role: null,
    summary: event_kind,
    payload,
    created_at: new Date().toISOString(),
  };
}

describe("run inspector model", () => {
  it("keeps runtime completion separate from independent verification", () => {
    const model = buildRunInspector([
      event("assignment_created", {
        assignmentId: "produce-1",
        envelope: {
          role: "chief_engineer",
          resolvedAgent: "keel",
          bindingRef: "codex-local-primary",
          parent: { envelopeId: null },
        },
        authority: {
          mediated: "local-write",
          providerNative: "Codex sandbox",
          unmanaged: "macOS user",
        },
      }),
      event("agent_completed", { assignmentId: "produce-1" }),
      event("verification_recorded", {
        verification: {
          label: "independent agent verification",
          status: "passed",
          producingAssignmentId: "produce-1",
          verifyingAssignmentId: "verify-1",
        },
      }),
    ]);

    expect(model.nodes[0].status).toBe("completed");
    expect(model.authorities[0]).toMatchObject({
      mediated: "local-write",
      providerNative: "Codex sandbox",
      unmanaged: "macOS user",
    });
    expect(model.verifications[0]).toEqual({
      label: "independent agent verification",
      status: "passed",
      producingAssignmentId: "produce-1",
      verifyingAssignmentId: "verify-1",
    });
  });
});
