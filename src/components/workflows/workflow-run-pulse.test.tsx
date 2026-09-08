// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { WorkEventItem } from "@/lib/data/work-receipts";
import { WorkflowRunPulse } from "./workflow-run-pulse";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const event = (id: string, kind: string, version: number, payload: Record<string, unknown> = {}): WorkEventItem => ({ id, record_id: null, workflow_run_id: "run", event_kind: kind, actor: "workflow-runner", durable_role: null, decision_role: null, summary: id, payload, run_version: version, created_at: `2026-09-07T00:00:0${version}Z` });

it("scrubs the agent traces and question history, holds a receipt across refresh, and returns to latest", async () => {
  const events = [event("Assigned", "assignment_created", 1, { assignmentId: "a", resolution: { selectedAgent: "Keel" } }), event("Question", "approval_request", 2), event("Finished", "agent_completed", 3, { assignmentId: "a" })];
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WorkflowRunPulse events={events} pendingQuestion />));
    expect(container.querySelector('svg[aria-label="Keel: 2 recorded events"]')).not.toBeNull();
    expect(container.querySelector('svg[aria-label="Questions in this part of the run"] title')?.textContent).toBe("Question");
    const slider = container.querySelector("input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "0"); slider.dispatchEvent(new Event("change", { bubbles: true })); slider.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(container.querySelector('svg[aria-label="Keel: 1 recorded events"]')).not.toBeNull();
    expect(container.querySelector('svg[aria-label="Questions in this part of the run"]')).toBeNull();
    expect(container.querySelector("ol")?.textContent).toBe("v1 · Assigned");
    await act(async () => root.render(<WorkflowRunPulse events={[...events, event("Later", "workflow_completed", 4)]} pendingQuestion={false} />));
    expect(container.querySelector("ol")?.textContent).toBe("v1 · Assigned");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Latest")!.click());
    expect(container.querySelector("ol")?.textContent).toContain("Later");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
