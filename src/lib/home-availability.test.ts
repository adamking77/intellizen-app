import { describe, expect, it } from "vitest";
import { addWorkflowDesignerStep, createWorkflowDesignerDraft } from "./workflow-designer";

import { activitySentence, collectHomeQuestions, filterRestingActivity, filterRestingHomeQuestions, filterSetAsideHomeTasks, groupTasksByTrigger, projectHomeTasks, workflowApprovalFollowUpWarning, workflowQuestion } from "./home-availability";

const approval = { kind: "approval" as const, requestId: "request", command: "ship", description: "Ship it", choices: ["allow_once" as const], messageId: "m", at: 10 };

describe("Home availability", () => {
  it("keeps room member identity in a question key", () => {
    const questions = collectHomeQuestions({
      threads: { Fiona: { profile: "Fiona", transcript: { pending: [approval] } } } as never,
      profiles: { Fiona: { name: "Fiona", displayName: "Fiona" } } as never,
      rooms: { room: { name: "Team", log: [], watermarks: {}, members: [] } } as never,
      prompts: { prompt: { group: "room", member: "Keel", memberKey: "acp:keel", decision: { ...approval, requestId: "same" } } } as never,
      runs: [],
    });
    expect(questions.map((question) => question.key)).toEqual(["profile:Fiona:none:request", "room:room:acp:keel:same"]);
  });

  it("reports source failures instead of claiming activity is moving", () => {
    expect(activitySentence({ model: null, questions: [], events: [], eventsState: "ready", sourceErrors: ["Work events unavailable"] }).sentence)
      .toBe("Some activity sources could not be read.");
  });

  it("hides only questions with proven quiet agent identity and restores the original list", () => {
    const rooms = {
      room: { name: "Team", log: [], watermarks: {}, members: [{ name: "keel", door: "acp" as const }] },
    };
    const questions = collectHomeQuestions({
      threads: { fiona: { profile: "fiona", transcript: { pending: [approval] } } } as never,
      profiles: { fiona: { name: "fiona", displayName: "Fiona" } } as never,
      rooms,
      prompts: {
        known: { group: "room", member: "Keel", memberKey: "keel", decision: { ...approval, requestId: "room" } },
        unknown: { group: "room", member: "Someone", memberKey: "missing", decision: { ...approval, requestId: "unknown" } },
      } as never,
      runs: [{ id: "run", name: "Review", status: "Needs approval", actor: "Fiona", current_step: "Approve", approvals: { approve: { decision: null } }, updated_at: "2026-09-07T12:00:00.000Z" } as never],
    });
    const visible = filterRestingHomeQuestions(questions, rooms, ["hermes:fiona", "acp:keel"]);
    expect(visible.map((question) => question.source === "workflow" ? question.source : question.key)).toEqual([
      "workflow",
      "room:room:missing:unknown",
    ]);
    expect(filterRestingHomeQuestions(questions, rooms, [])).toEqual(questions);
    expect(questions).toHaveLength(4);
  });

  it("hides only active traces owned by proven quiet profile or room identities", () => {
    const model = {
      progress: [
        { id: "profile", target: { type: "profile", id: "fiona" } },
        { id: "room", target: { type: "room", id: "room" } },
        { id: "unknown-room", target: { type: "room", id: "unknown" } },
        { id: "run", target: { type: "run", id: "run" } },
      ],
    } as never;
    const visible = filterRestingActivity(model, {
      room: { name: "Team", log: [], watermarks: {}, turn: "keel", members: [{ name: "keel", door: "acp" }] },
    } as never, ["hermes:fiona", "acp:keel"]);
    expect(visible?.progress.map((item) => item.id)).toEqual(["unknown-room", "run"]);
    expect(filterRestingActivity(model, {}, [])?.progress).toHaveLength(4);
  });

  it("pluralizes workflow counts", () => {
    const sentence = activitySentence({
      model: { progress: [], openWorkflows: [
        { state: "In progress" }, { state: "In progress" },
        { state: "Queued" }, { state: "Queued" }, { state: "Queued" },
      ] } as never,
      questions: [], events: [], eventsState: "ready", sourceErrors: [],
    }).sentence;
    expect(sentence).toContain("2 workflows are in progress.");
    expect(sentence).toContain("3 workflows are queued.");
  });

  it("groups only by declared trigger and keeps unscoped tasks in a scope", () => {
    const tasks = projectHomeTasks([
      { id: "one", task_name: "Read", task_trigger: "Thirty minutes", task_scope_node_id: null },
      { id: "two", task_name: "Write", task_trigger: "Two hours", task_scope_node_id: "project" },
      { id: "three", task_name: "Legacy", task_scope_node_id: "missing" },
      { id: "out", task_name: "Elsewhere", task_kind: "keeping_out", task_scope_node_id: "other" },
    ], [{ id: "workspace", kind: "workspace", parent_id: null }, { id: "project", kind: "project", parent_id: "workspace" }, { id: "other", kind: "workspace", parent_id: null }] as never, "workspace");
    expect(tasks.map((task) => task.id)).toEqual(["one", "two", "three"]);
    expect(groupTasksByTrigger(tasks).map((group) => group.trigger)).toEqual(["Thirty minutes", "Two hours", "No trigger recorded"]);
  });

  it("does not mark a stored scope broken while hierarchy is unavailable", () => {
    const tasks = projectHomeTasks([
      { id: "one", task_name: "Scoped", task_scope_node_id: "project-a" },
      { id: "two", task_name: "Unscoped", task_scope_node_id: null },
    ], null, "project-b");
    expect(tasks).toEqual([expect.objectContaining({ id: "two", scopeValid: true })]);
  });

  it("locally hides set-aside project work while retaining unscoped and other project work", () => {
    const hierarchy = [
      { id: "workspace", kind: "workspace", parent_id: null },
      { id: "project-a", kind: "project", parent_id: "workspace" },
      { id: "project-child", kind: "project", parent_id: "project-a" },
      { id: "project-b", kind: "project", parent_id: "workspace" },
    ] as never;
    const tasks = projectHomeTasks([
      { id: "a", task_name: "Set aside", task_scope_node_id: "project-a" },
      { id: "child", task_name: "Nested", task_scope_node_id: "project-child" },
      { id: "b", task_name: "Other", task_scope_node_id: "project-b" },
      { id: "free", task_name: "Unscoped", task_scope_node_id: null },
      { id: "done", task_name: "Done", task_status: "Done" },
    ], hierarchy, null);
    const visible = filterSetAsideHomeTasks(tasks, hierarchy, ["project-a"]);
    expect(visible.map((task) => task.id)).toEqual(["b", "free", "done"]);
    expect(groupTasksByTrigger(visible).flatMap((group) => group.tasks).map((task) => task.id)).toEqual(["b", "free"]);
  });

  it("keeps a workflow approval tied to its run and approval identity", () => {
    const [question] = collectHomeQuestions({
      threads: {}, profiles: {}, rooms: {}, prompts: {},
      runs: [{ id: "run", name: "Publish brief", status: "Needs approval", actor: "Fiona", owner_role: null, current_step: "Approval requested: publish", current_step_id: "approve", approvals: { approve: { approvalId: "approval", decision: null, requiredRole: "founder_approval_authority", payloadHash: "sha256:exact", payloadSnapshot: { target: "brief" } } }, run_version: 4, updated_at: "2026-09-07T12:00:00.000Z" } as never],
    });
    expect(question).toMatchObject({ key: "workflow:run:approval:4", source: "workflow", runId: "run", approvalId: "approval", payloadHash: "sha256:exact", payloadSnapshot: { target: "brief" }, owner: "Fiona" });
  });

  it("uses only the current structured approval but retains a legacy pending approval", () => {
    const structured = { id: "run", name: "Review", status: "Needs approval", schema_version: "intellizen.workflow/1", current_step_id: "current", approvals: { old: { approvalId: "old", stepId: "old", decision: null }, current: { approvalId: "current", stepId: "current", decision: null, requiredRole: "founder_approval_authority", payloadHash: "sha256:current" } }, updated_at: "2026-09-07T12:00:00.000Z" };
    expect(workflowQuestion(structured as never)).toMatchObject({ approvalId: "current", decisionRole: "founder_approval_authority" });
    expect(workflowQuestion({ ...structured, current_step_id: "missing" } as never)).toBeNull();
    expect(workflowQuestion({ ...structured, schema_version: null, current_step_id: null } as never)).toMatchObject({ approvalId: "old" });
  });

  it("projects the current step from the immutable definition instead of stale legacy text", () => {
    const definition = addWorkflowDesignerStep(createWorkflowDesignerDraft({ id: "home-step", name: "Home step" }), "approval");
    const current = definition.steps[1];
    if (current.kind !== "approval") throw new Error("Unexpected workflow fixture");
    current.title = "Approve fixture";
    const question = workflowQuestion({
      id: "run", name: "Review", status: "Needs approval", schema_version: "intellizen.workflow/1",
      definition_snapshot: definition, current_step_id: current.id, current_step: "Queued: Prepare synthetic approval payload",
      step_states: { [current.id]: "running" }, approvals: { [current.id]: { approvalId: "approval", stepId: current.id, decision: null } },
      updated_at: "2026-09-07T12:00:00.000Z",
    } as never);
    expect(question).toMatchObject({ currentStep: "Approve fixture — running", detail: "Approve fixture — running" });
  });

  it("reports a dispatch resume failure after an approval has been recorded", () => {
    expect(workflowApprovalFollowUpWarning({ write_performed: true, resume_error: "Codex binding stopped" })).toContain("Codex binding stopped");
  });
});
