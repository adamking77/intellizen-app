import { describe, expect, it } from "vitest";
import { latestWorkflowRun, runResultVariant, workflowActor, workflowNextRun } from "./workflow-presentation";
import type { WorkflowRunItem, WorkflowTemplateItem } from "@/lib/types";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import { workflowCronName, type CronJob } from "@/services/hermes-cron";
const item = { workflow: { id: "workflow", workflow_id: "review", name: "Review", default_actor: "Claude" } as WorkflowTemplateItem, definition: null } as WorkflowCatalogItem;

describe("workflow factual presentation", () => {
  it("orders run starts independently of subsequent receipt writes", () => {
    const older = { id: "old", workflow_record_id: "workflow", started_at: "2026-09-01", updated_at: "2026-09-05" } as WorkflowRunItem;
    const newer = { ...older, id: "new", started_at: "2026-09-02", updated_at: "2026-09-03" };
    expect(latestWorkflowRun([older, newer], "workflow")?.id).toBe("new");
  });
  it("never infers runtime from an actor name", () => { expect(workflowActor(item, [])).toEqual({ name: "Claude", runtime: undefined }); });
  it("does not claim verification from completion or rejection", () => {
    expect(runResultVariant("Done")).toBe("neutral");
    expect(runResultVariant("Completed")).toBe("neutral");
    expect(runResultVariant("Succeeded")).toBe("neutral");
    expect(runResultVariant("Success")).toBe("neutral");
    expect(runResultVariant("Rejected")).toBe("failure");
    expect(runResultVariant("Verified")).toBe("verified");
    expect(runResultVariant("In progress")).toBe("runtime");
  });
  it("uses the schedule next run and distinguishes paused schedules", () => {
    const job = { name: workflowCronName(item.workflow), prompt: "", enabled: false, nextRunAt: "2026-09-07T07:00:00Z" } as CronJob;
    expect(workflowNextRun(item, [job])).toBe("Paused");
    expect(workflowNextRun(item, [])).toBe("—");
    expect(workflowNextRun(item, [{ ...job, enabled: true }])).toContain("7");
    expect(workflowNextRun(item, [{ ...job, enabled: true, nextRunAt: null }])).toBe("Not reported");
  });
});
