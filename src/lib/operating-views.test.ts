import { describe, expect, it } from "vitest";

import {
  buildActiveApprovalsView,
  buildAgentRoleWorkloadView,
  buildReceiptReflectionDigest,
  buildWeeklyOperatingBrief,
} from "@/lib/operating-views";
import type { AgentProjectItem, AgentWorkItem, WorkflowRunItem, WorkflowTemplateItem } from "@/lib/types";

const baseWork = {
  source: "workspace.records",
  database_id: "tasks",
  assignee: null,
  area: null,
  initiative_id: "project-1",
  initiative_name: "GenZen Solutions Site Rebuild",
  initiative_agent_owner: "Steve",
  durable_role: "Distribution Operator",
  functional_lane: "Distribution",
  backup_actor: null,
  approval_needed: null,
  next_step: null,
  latest_note: null,
  latest_receipt: null,
  body_preview: "",
  updated_at: "2026-07-01T12:00:00.000Z",
} satisfies Omit<AgentWorkItem, "id" | "title" | "status" | "stage" | "priority" | "current_actor">;

describe("operating-views", () => {
  it("builds a weekly operating brief from live work and workflow state", () => {
    const projects: AgentProjectItem[] = [
      {
        id: "project-1",
        source: "workspace.records",
        database_id: "bizops",
        title: "GenZen Solutions Site Rebuild",
        stage: "Doing",
        priority: "High",
        assignee: ["Steve"],
        agent_owner: "Steve",
        week_theme: "Build",
        task_ids: ["task-approval", "task-blocked"],
        body_preview: "",
        updated_at: "2026-07-01T12:00:00.000Z",
      },
    ];
    const workItems: AgentWorkItem[] = [
      {
        ...baseWork,
        id: "task-approval",
        title: "Review homepage proof section",
        status: "Needs approval",
        stage: "Review",
        priority: "High",
        current_actor: "Adam",
        approval_needed: "Approve proof section",
        latest_receipt: "## Workflow Run Update\nSummary:\nProof section ready for review.",
      },
      {
        ...baseWork,
        id: "task-blocked",
        title: "Publish distribution page",
        status: "Blocked",
        stage: "Doing",
        priority: "Critical",
        current_actor: "Codex",
      },
    ];
    const workflows: WorkflowTemplateItem[] = [
      {
        id: "workflow-1",
        workflow_id: "gzs.expertise_page_build",
        name: "GZS Expertise Page Build",
        status: "Active",
        entity: "GenZen Solutions",
        owner_role: "Distribution Operator",
        default_actor: "Steve",
        source_document_id: "1600",
        source_path: "initiatives/genzen-solutions/workflows/expertise-page.md",
        trigger: "manual",
        required_inputs: null,
        default_routing: null,
        approval_gates: "Brief approval",
        expected_output: "Published page",
        related_databases: ["Tasks"],
        receipt_template: null,
        success_criteria: null,
        failure_behavior: null,
        run_ids: ["run-1"],
        body_preview: "",
        updated_at: "2026-07-01T12:00:00.000Z",
      },
    ];
    const workflowRuns: WorkflowRunItem[] = [
      {
        id: "run-1",
        name: "GZS Expertise Page Build",
        status: "In progress",
        workflow_record_id: "workflow-1",
        task_id: "task-approval",
        biz_ops_id: "project-1",
        entity_scope: "GenZen Solutions",
        owner_role: "Distribution Operator",
        actor: "Steve",
        trigger_source: "ui",
        current_step: "Drafting",
        source_documents: ["1600"],
        source_records: "task-approval",
        context: null,
        receipt: null,
        started_at: "2026-07-01T12:00:00.000Z",
        completed_at: null,
        body_preview: "",
        updated_at: "2026-07-01T13:00:00.000Z",
      },
    ];

    const brief = buildWeeklyOperatingBrief({
      projects,
      workItems,
      workflows,
      workflowRuns,
      generatedAt: new Date("2026-07-02T08:00:00.000Z"),
    });

    expect(brief.title).toBe("Weekly Operating Brief - 2026-07-02");
    expect(brief.sourcePath).toBe("operating-briefs/weekly/2026-07-02-weekly-operating-brief.md");
    expect(brief.metrics).toMatchObject({
      openWork: 2,
      approvals: 1,
      blocked: 1,
      activeRuns: 1,
      activeWorkflows: 1,
    });
    expect(brief.markdown).toContain("## Needs Adam");
    expect(brief.markdown).toContain("Review homepage proof section");
    expect(brief.markdown).toContain("## Blockers");
    expect(brief.markdown).toContain("Publish distribution page");
    expect(brief.markdown).toContain("## Recent Receipts");
    expect(brief.sourceRecords).toEqual(expect.arrayContaining(["task-approval", "task-blocked", "run-1"]));
  });

  it("builds a receipt reflection digest from work receipts and workflow run receipts", () => {
    const workItems: AgentWorkItem[] = [
      {
        ...baseWork,
        id: "task-approval",
        title: "Review homepage proof section",
        status: "Needs approval",
        stage: "Review",
        priority: "High",
        current_actor: "Adam",
        approval_needed: "Approve proof section before publishing.",
        next_step: "Next step: Adam approval.",
        latest_receipt: "Summary: Proof section is ready. Approval needed before publish.",
      },
      {
        ...baseWork,
        id: "task-blocked",
        title: "Publish distribution page",
        status: "Blocked",
        stage: "Doing",
        priority: "Critical",
        current_actor: "Codex",
        latest_receipt: "Summary: Publish failed because the DNS path is blocked.",
      },
    ];
    const workflowRuns: WorkflowRunItem[] = [
      {
        id: "run-1",
        name: "GZS Expertise Page Build",
        status: "In progress",
        workflow_record_id: "workflow-1",
        task_id: "task-approval",
        biz_ops_id: "project-1",
        entity_scope: "GenZen Solutions",
        owner_role: "Distribution Operator",
        actor: "Steve",
        trigger_source: "ui",
        current_step: "Current step: Draft introduction.",
        source_documents: ["1600"],
        source_records: "task-approval",
        context: null,
        receipt: "Actions taken: Drafted intro. Follow up: attach final screenshot.",
        started_at: "2026-07-01T12:00:00.000Z",
        completed_at: null,
        body_preview: "",
        updated_at: "2026-07-01T13:00:00.000Z",
      },
    ];

    const digest = buildReceiptReflectionDigest({
      workItems,
      workflowRuns,
      generatedAt: new Date("2026-07-02T08:00:00.000Z"),
    });

    expect(digest.title).toBe("Receipt Reflection Digest - 2026-07-02");
    expect(digest.sourcePath).toBe("operating-briefs/reflections/2026-07-02-receipt-reflection-digest.md");
    expect(digest.metrics).toMatchObject({
      recordsReviewed: 3,
      receipts: 3,
      approvals: 1,
      blockers: 1,
      followUps: 3,
    });
    expect(digest.markdown).toContain("## Approval Memory");
    expect(digest.markdown).toContain("Review homepage proof section");
    expect(digest.markdown).toContain("## Blocker Memory");
    expect(digest.markdown).toContain("Publish distribution page");
    expect(digest.markdown).toContain("## Follow-Up Signals");
    expect(digest.sourceRecords).toEqual(expect.arrayContaining(["task-approval", "task-blocked", "run-1"]));
  });

  it("builds an active approvals view from work and workflow run approval gates", () => {
    const workItems: AgentWorkItem[] = [
      {
        ...baseWork,
        id: "task-approval",
        title: "Review homepage proof section",
        status: "Needs approval",
        stage: "Review",
        priority: "High",
        current_actor: "Adam",
        approval_needed: "Approve proof section before publishing.",
        updated_at: "2026-06-29T08:00:00.000Z",
      },
      {
        ...baseWork,
        id: "task-low",
        title: "Review optional copy note",
        status: "Needs approval",
        stage: "Review",
        priority: "Low",
        current_actor: "Adam",
        approval_needed: "Optional copy decision.",
        updated_at: "2026-07-02T06:00:00.000Z",
      },
    ];
    const workflowRuns: WorkflowRunItem[] = [
      {
        id: "run-approval",
        name: "GZS Expertise Page Approval",
        status: "Needs approval",
        workflow_record_id: "workflow-1",
        task_id: "task-approval",
        biz_ops_id: "project-1",
        entity_scope: "GenZen Solutions",
        owner_role: "Distribution Operator",
        actor: "Steve",
        trigger_source: "ui",
        current_step: "Approve final draft.",
        source_documents: ["1600"],
        source_records: "task-approval",
        context: null,
        receipt: null,
        started_at: "2026-07-01T12:00:00.000Z",
        completed_at: null,
        body_preview: "",
        updated_at: "2026-07-01T13:00:00.000Z",
      },
    ];

    const view = buildActiveApprovalsView({
      workItems,
      workflowRuns,
      generatedAt: new Date("2026-07-02T08:00:00.000Z"),
    });

    expect(view.spec.view_id).toBe("ops.active_approvals");
    expect(view.metrics).toMatchObject({
      total: 3,
      workItems: 2,
      workflowRuns: 1,
      highPriority: 1,
      stale: 1,
    });
    expect(view.approvals[0].id).toBe("task-approval");
    expect(view.approvals.map((item) => item.id)).toEqual(expect.arrayContaining(["task-approval", "task-low", "run-approval"]));
    expect(view.spec.source_records).toEqual(expect.arrayContaining(["task-approval", "task-low", "run-approval"]));
  });

  it("builds an agent role workload view grouped by actor and role", () => {
    const workItems: AgentWorkItem[] = [
      {
        ...baseWork,
        id: "task-codex",
        title: "Build active approvals view",
        status: "In progress",
        stage: "Build",
        priority: "High",
        current_actor: "Codex",
        durable_role: "App Builder",
      },
      {
        ...baseWork,
        id: "task-codex-approval",
        title: "Review copy",
        status: "Needs approval",
        stage: "Review",
        priority: "Medium",
        current_actor: "Codex",
        durable_role: "App Builder",
      },
      {
        ...baseWork,
        id: "task-unassigned",
        title: "Triage inbox",
        status: "Blocked",
        stage: "Triage",
        priority: "Critical",
        current_actor: null,
        durable_role: null,
        functional_lane: null,
      },
    ];

    const view = buildAgentRoleWorkloadView({ workItems });

    expect(view.spec.view_id).toBe("ops.agent_role_workload");
    expect(view.metrics).toMatchObject({
      openWork: 3,
      actors: 2,
      highPriority: 2,
      blocked: 1,
      unassigned: 1,
    });
    expect(view.lanes.map((lane) => lane.label)).toEqual(expect.arrayContaining(["Codex", "Unassigned"]));
    expect(view.lanes.find((lane) => lane.label === "Codex")).toMatchObject({ count: 2, needsApproval: 1 });
    expect(view.lanes.find((lane) => lane.label === "Unassigned")).toMatchObject({ count: 1, blocked: 1 });
    expect(view.spec.source_records).toEqual(expect.arrayContaining(["task-codex", "task-codex-approval", "task-unassigned"]));
  });
});
