import { describe, expect, it } from "vitest";

import {
  activeWorkForRole,
  activeWorkState,
  isActiveWorkflowRun,
} from "@/lib/active-work";
import type { WorkflowRunItem } from "@/lib/types";

function run(input: Partial<WorkflowRunItem>): WorkflowRunItem {
  return {
    id: "run-1",
    name: "Proof run",
    status: "In progress",
    workflow_record_id: null,
    task_id: null,
    biz_ops_id: null,
    entity_scope: null,
    owner_role: "chief_engineer",
    actor: "Keel",
    trigger_source: null,
    current_step: "Build",
    source_documents: [],
    source_records: null,
    context: null,
    receipt: null,
    started_at: null,
    completed_at: null,
    schema_version: null,
    definition_snapshot: null,
    current_step_id: null,
    step_states: null,
    approvals: null,
    run_version: null,
    body_preview: "",
    updated_at: "2026-07-28T00:00:00.000Z",
    ...input,
  };
}

describe("active work", () => {
  it("keeps blocked and approval states distinct", () => {
    expect(activeWorkState("Blocked")).toBe("blocked");
    expect(activeWorkState("Needs approval")).toBe("awaiting-approval");
    expect(activeWorkState("Queued")).toBe("queued");
  });

  it("excludes terminal runs", () => {
    expect(isActiveWorkflowRun(run({ status: "Done" }))).toBe(false);
    expect(isActiveWorkflowRun(run({ status: "In progress" }))).toBe(true);
  });

  it("resolves work through role ownership or the current occupant", () => {
    const work = activeWorkForRole(
      [
        run({ id: "role-owned", owner_role: "chief_engineer" }),
        run({ id: "agent-owned", owner_role: null, actor: "Keel" }),
        run({ id: "finished", status: "Done" }),
      ],
      "chief_engineer",
      "Keel",
    );
    expect(work.map((item) => item.id)).toEqual(["role-owned", "agent-owned"]);
    expect(work[0].workflowRecordId).toBeNull();
    expect(work[0].canonicalPath).toBe("/workflows?run=role-owned");
  });
});
