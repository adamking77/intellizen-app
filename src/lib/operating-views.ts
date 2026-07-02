import type { AgentProjectItem, AgentWorkItem, WorkflowRunItem, WorkflowTemplateItem } from "@/lib/types";

export interface NativeOperatingViewSpec {
  view_id: string;
  title: string;
  entity_scope: string;
  purpose: string;
  source_tables: string[];
  source_records: string[];
  filters: string[];
  layout: string;
  components: string[];
  fields: string[];
  sort: string;
  grouping: string;
  actions: string[];
  permissions: string[];
  freshness: string;
  save_policy: string;
}

export interface OperatingViewLane {
  id: string;
  label: string;
  count: number;
  work: AgentWorkItem[];
}

export interface GzsDistributionHealthView {
  spec: NativeOperatingViewSpec;
  project: AgentProjectItem | null;
  metrics: {
    openWork: number;
    needsApproval: number;
    blocked: number;
    activeRuns: number;
    workflowTemplates: number;
  };
  lanes: OperatingViewLane[];
  attentionWork: AgentWorkItem[];
  workflowTemplates: WorkflowTemplateItem[];
  workflowRuns: WorkflowRunItem[];
}

export interface WeeklyOperatingBrief {
  title: string;
  sourcePath: string;
  generatedAt: string;
  markdown: string;
  metrics: {
    openWork: number;
    approvals: number;
    blocked: number;
    activeRuns: number;
    activeWorkflows: number;
  };
  sourceRecords: string[];
}

export interface ReceiptReflectionDigest {
  title: string;
  sourcePath: string;
  generatedAt: string;
  markdown: string;
  metrics: {
    recordsReviewed: number;
    receipts: number;
    approvals: number;
    blockers: number;
    followUps: number;
  };
  sourceRecords: string[];
}

interface ReceiptReflectionEntry {
  id: string;
  kind: "work" | "run";
  title: string;
  status: string | null;
  owner: string | null;
  priority: string | null;
  currentStep: string | null;
  updatedAt: string;
  receipt: string | null;
  approvalNeeded: string | null;
  nextStep: string | null;
}

const GZS_DISTRIBUTION_TERMS = [
  "genzen solutions",
  "distribution",
  "introducer",
  "case",
  "brief",
  "expertise",
  "homepage",
  "publish",
  "launch",
  "testimonial",
  "schema",
  "seo",
  "geo",
  "signal fire",
  "declassified",
  "fortress",
];

function lower(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}

function matchesAnyTerm(value: string, terms = GZS_DISTRIBUTION_TERMS) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function priorityRank(priority: string | null | undefined) {
  const normalized = lower(priority);
  if (normalized === "critical") return 4;
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 1;
  return 0;
}

function updatedTime(item: { updated_at: string }) {
  return new Date(item.updated_at).getTime() || 0;
}

function sortWork(left: AgentWorkItem, right: AgentWorkItem) {
  return priorityRank(right.priority) - priorityRank(left.priority) || updatedTime(right) - updatedTime(left);
}

function sortRuns(left: WorkflowRunItem, right: WorkflowRunItem) {
  return updatedTime(right) - updatedTime(left);
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function line(value: string | null | undefined, fallback = "unassigned") {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function bulletList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None visible.";
}

function summarizeWork(item: AgentWorkItem) {
  const owner = item.current_actor ?? (Array.isArray(item.assignee) ? item.assignee.join(", ") : item.assignee);
  return `**${item.title}** — ${line(item.status, "No status")} / ${line(item.priority, "No priority")} / ${line(owner)}`;
}

function summarizeRun(run: WorkflowRunItem) {
  return `**${run.name}** — ${line(run.status, "No status")} / ${line(run.actor)} / ${line(run.current_step, "No current step")}`;
}

function latestReceiptSummary(item: AgentWorkItem) {
  if (!item.latest_receipt) return null;
  return `**${item.title}** — ${item.latest_receipt.replace(/\s+/g, " ").slice(0, 220)}`;
}

function compactReceipt(value: string | null | undefined, maxLength = 280) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function isApprovalStatus(value: string | null | undefined) {
  return lower(value) === "needs approval";
}

function isBlockedStatus(value: string | null | undefined) {
  return lower(value) === "blocked";
}

function hasBlockerLanguage(value: string | null | undefined) {
  const text = lower(value);
  return ["blocked", "blocker", "failed", "failure", "error", "unreachable"].some((term) => text.includes(term));
}

function hasApprovalLanguage(value: string | null | undefined) {
  const text = lower(value);
  return ["approval", "approve", "review needed", "needs adam"].some((term) => text.includes(term));
}

function followUpSignals(entry: ReceiptReflectionEntry) {
  const text = [entry.receipt, entry.approvalNeeded, entry.nextStep, entry.currentStep].filter(Boolean).join("\n");
  return text
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*#\s]+/, "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => matchesAnyTerm(item, ["next step", "follow up", "follow-up", "blocked", "approval", "current step", "todo"]))
    .slice(0, 3);
}

function summarizeReflectionEntry(entry: ReceiptReflectionEntry) {
  const owner = entry.owner ?? "unassigned";
  const status = line(entry.status, "No status");
  const priority = entry.priority ? ` / ${entry.priority}` : "";
  const receipt = compactReceipt(entry.receipt ?? entry.nextStep ?? entry.currentStep);
  return `**${entry.title}** - ${status}${priority} / ${owner}${receipt ? ` - ${receipt}` : ""}`;
}

function workflowMatchesGzs(workflow: WorkflowTemplateItem) {
  return (
    workflow.workflow_id.startsWith("gzs.") ||
    matchesAnyTerm(
      [
        workflow.name,
        workflow.entity,
        workflow.owner_role,
        workflow.source_path,
        workflow.expected_output,
        workflow.body_preview,
      ]
        .filter(Boolean)
        .join(" "),
    )
  );
}

export function buildGzsDistributionHealthView(input: {
  projects: AgentProjectItem[];
  workItems: AgentWorkItem[];
  workflows: WorkflowTemplateItem[];
  workflowRuns: WorkflowRunItem[];
}): GzsDistributionHealthView {
  const project =
    input.projects.find((item) => item.title === "GenZen Solutions Site Rebuild") ??
    input.projects.find((item) => lower(item.title).includes("genzen solutions")) ??
    null;
  const projectIds = new Set(project ? [project.id] : []);

  const scopedWork = input.workItems.filter((item) => {
    if (item.initiative_id && projectIds.has(item.initiative_id)) return true;
    return matchesAnyTerm([item.title, item.initiative_name, item.body_preview].filter(Boolean).join(" "));
  });

  const workflowTemplates = input.workflows.filter(workflowMatchesGzs);
  const workflowIds = new Set(workflowTemplates.map((workflow) => workflow.id));
  const workflowRuns = input.workflowRuns.filter((run) => {
    if (run.workflow_record_id && workflowIds.has(run.workflow_record_id)) return true;
    if (run.biz_ops_id && projectIds.has(run.biz_ops_id)) return true;
    return matchesAnyTerm([run.name, run.entity_scope, run.current_step, run.body_preview].filter(Boolean).join(" "));
  });

  const needsApproval = scopedWork.filter((item) => item.status === "Needs approval" || Boolean(item.approval_needed));
  const blocked = scopedWork.filter((item) => item.status === "Blocked");
  const assetWork = scopedWork.filter((item) =>
    matchesAnyTerm(item.title, ["case", "brief", "expertise", "homepage", "testimonial", "schema", "publish", "page"]),
  );
  const relationshipWork = scopedWork.filter((item) =>
    matchesAnyTerm(item.title, ["distribution", "introducer", "submit", "listing", "launch", "share"]),
  );

  const lanes: OperatingViewLane[] = [
    { id: "approval", label: "Approval gates", count: needsApproval.length, work: needsApproval.slice().sort(sortWork).slice(0, 4) },
    { id: "assets", label: "Proof assets", count: assetWork.length, work: assetWork.slice().sort(sortWork).slice(0, 4) },
    { id: "relationships", label: "Distribution", count: relationshipWork.length, work: relationshipWork.slice().sort(sortWork).slice(0, 4) },
    { id: "blocked", label: "Blocked", count: blocked.length, work: blocked.slice().sort(sortWork).slice(0, 4) },
  ];

  const sourceRecords = [
    ...(project ? [project.id] : []),
    ...scopedWork.slice(0, 12).map((item) => item.id),
    ...workflowTemplates.slice(0, 6).map((workflow) => workflow.id),
    ...workflowRuns.slice(0, 6).map((run) => run.id),
  ];

  return {
    spec: {
      view_id: "gzs.distribution_health",
      title: "GZS distribution health",
      entity_scope: "GenZen Solutions",
      purpose: "Show what needs attention before distribution assets, proof pages, and launch work can move.",
      source_tables: [
        "workspace.records / Biz Ops",
        "workspace.records / Tasks",
        "workspace.records / Workflow Registry",
        "workspace.records / Workflow Runs",
      ],
      source_records: Array.from(new Set(sourceRecords)),
      filters: [
        "initiative = GenZen Solutions Site Rebuild when linked",
        "or title/body contains distribution, introducer, case, brief, expertise, homepage, publish, launch, SEO, GEO, or related GZS terms",
        "exclude completed workflow runs",
      ],
      layout: "Home operating snapshot with metrics, attention queue, lane summaries, and visible spec metadata.",
      components: ["metrics", "attention_queue", "lane_summary", "source_spec"],
      fields: ["title", "status", "stage", "priority", "current_actor", "initiative_name", "updated_at"],
      sort: "priority desc, updated_at desc",
      grouping: "approval gates, proof assets, distribution, blocked",
      actions: ["open Databases", "open task database", "open Workflow Runs database"],
      permissions: ["read workspace.records", "no write path", "no external action"],
      freshness: "React Query refetches every 60 seconds.",
      save_policy: "Native typed view spec in code; no generated React or second state store.",
    },
    project,
    metrics: {
      openWork: scopedWork.length,
      needsApproval: needsApproval.length,
      blocked: blocked.length,
      activeRuns: workflowRuns.length,
      workflowTemplates: workflowTemplates.length,
    },
    lanes,
    attentionWork: [...needsApproval, ...blocked, ...scopedWork.filter((item) => priorityRank(item.priority) >= 3)]
      .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
      .sort(sortWork)
      .slice(0, 6),
    workflowTemplates,
    workflowRuns,
  };
}

export function buildWeeklyOperatingBrief(input: {
  projects: AgentProjectItem[];
  workItems: AgentWorkItem[];
  workflows: WorkflowTemplateItem[];
  workflowRuns: WorkflowRunItem[];
  generatedAt?: Date;
}): WeeklyOperatingBrief {
  const generatedAt = input.generatedAt ?? new Date();
  const dateKey = formatDate(generatedAt);
  const openWork = input.workItems.filter((item) => item.status !== "Done");
  const approvals = openWork.filter((item) => item.status === "Needs approval" || Boolean(item.approval_needed));
  const blocked = openWork.filter((item) => item.status === "Blocked");
  const activeRuns = input.workflowRuns.filter((run) => !["Done", "Deferred"].includes(run.status ?? ""));
  const activeWorkflows = input.workflows.filter((workflow) => workflow.status === "Active");
  const topWork = openWork.slice().sort(sortWork).slice(0, 8);
  const recentRuns = activeRuns.slice().sort(sortRuns).slice(0, 6);
  const recentReceipts = openWork
    .slice()
    .sort((left, right) => updatedTime(right) - updatedTime(left))
    .map(latestReceiptSummary)
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
  const gzsView = buildGzsDistributionHealthView({
    projects: input.projects,
    workItems: input.workItems,
    workflows: input.workflows,
    workflowRuns: input.workflowRuns,
  });

  const sourceRecords = Array.from(
    new Set([
      ...topWork.map((item) => item.id),
      ...approvals.slice(0, 6).map((item) => item.id),
      ...blocked.slice(0, 6).map((item) => item.id),
      ...recentRuns.map((run) => run.id),
      ...gzsView.spec.source_records,
    ]),
  );

  const markdown = `# Weekly Operating Brief - ${dateKey}

Generated: ${generatedAt.toISOString()}

## Executive State

- Open work: ${openWork.length}
- Approval gates: ${approvals.length}
- Blocked items: ${blocked.length}
- Active workflow runs: ${activeRuns.length}
- Active workflow templates: ${activeWorkflows.length}

## Needs Adam

${bulletList(approvals.slice().sort(sortWork).slice(0, 8).map(summarizeWork))}

## Blockers

${bulletList(blocked.slice().sort(sortWork).slice(0, 8).map(summarizeWork))}

## Priority Work

${bulletList(topWork.map(summarizeWork))}

## Active Workflow Runs

${bulletList(recentRuns.map(summarizeRun))}

## GZS Distribution Snapshot

- Open distribution work: ${gzsView.metrics.openWork}
- Approval gates: ${gzsView.metrics.needsApproval}
- Blocked: ${gzsView.metrics.blocked}
- Active runs: ${gzsView.metrics.activeRuns}
- Workflow templates: ${gzsView.metrics.workflowTemplates}

## Recent Receipts

${bulletList(recentReceipts)}

## Source Record IDs

${bulletList(sourceRecords)}
`;

  return {
    title: `Weekly Operating Brief - ${dateKey}`,
    sourcePath: `operating-briefs/weekly/${dateKey}-weekly-operating-brief.md`,
    generatedAt: generatedAt.toISOString(),
    markdown,
    metrics: {
      openWork: openWork.length,
      approvals: approvals.length,
      blocked: blocked.length,
      activeRuns: activeRuns.length,
      activeWorkflows: activeWorkflows.length,
    },
    sourceRecords,
  };
}

export function buildReceiptReflectionDigest(input: {
  workItems: AgentWorkItem[];
  workflowRuns: WorkflowRunItem[];
  generatedAt?: Date;
}): ReceiptReflectionDigest {
  const generatedAt = input.generatedAt ?? new Date();
  const dateKey = formatDate(generatedAt);

  const workEntries: ReceiptReflectionEntry[] = input.workItems
    .filter(
      (item) =>
        Boolean(item.latest_receipt) ||
        isApprovalStatus(item.status) ||
        isBlockedStatus(item.status) ||
        Boolean(item.approval_needed),
    )
    .map((item) => ({
      id: item.id,
      kind: "work",
      title: item.title,
      status: item.status,
      owner: item.current_actor ?? (Array.isArray(item.assignee) ? item.assignee.join(", ") : item.assignee),
      priority: item.priority,
      currentStep: item.stage,
      updatedAt: item.updated_at,
      receipt: item.latest_receipt ?? null,
      approvalNeeded: item.approval_needed ?? null,
      nextStep: item.next_step ?? null,
    }));

  const runEntries: ReceiptReflectionEntry[] = input.workflowRuns
    .filter((run) => Boolean(run.receipt) || isApprovalStatus(run.status) || isBlockedStatus(run.status))
    .map((run) => ({
      id: run.id,
      kind: "run",
      title: run.name,
      status: run.status,
      owner: run.actor,
      priority: null,
      currentStep: run.current_step,
      updatedAt: run.updated_at,
      receipt: run.receipt,
      approvalNeeded: isApprovalStatus(run.status) ? run.current_step : null,
      nextStep: run.current_step,
    }));

  const entries = [...workEntries, ...runEntries].sort((left, right) => {
    const leftPriority = left.kind === "work" ? priorityRank(left.priority) : 0;
    const rightPriority = right.kind === "work" ? priorityRank(right.priority) : 0;
    return rightPriority - leftPriority || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  const entriesWithReceipts = entries.filter((entry) => Boolean(entry.receipt));
  const approvalEntries = entries.filter(
    (entry) => isApprovalStatus(entry.status) || Boolean(entry.approvalNeeded) || hasApprovalLanguage(entry.receipt),
  );
  const blockerEntries = entries.filter((entry) => isBlockedStatus(entry.status) || hasBlockerLanguage(entry.receipt));
  const followUpEntries = entries
    .map((entry) => ({ entry, signals: followUpSignals(entry) }))
    .filter((item) => item.signals.length > 0);

  const sourceRecords = Array.from(new Set(entries.slice(0, 30).map((entry) => entry.id)));
  const decisionEntries = entriesWithReceipts.length > 0 ? entriesWithReceipts : entries;

  const markdown = `# Receipt Reflection Digest - ${dateKey}

Generated: ${generatedAt.toISOString()}

## Reflection Inputs

- Records reviewed: ${entries.length}
- Receipts found: ${entriesWithReceipts.length}
- Approval memory records: ${approvalEntries.length}
- Blocker memory records: ${blockerEntries.length}
- Follow-up signal records: ${followUpEntries.length}

## Decisions And State Changes

${bulletList(decisionEntries.slice(0, 10).map(summarizeReflectionEntry))}

## Approval Memory

${bulletList(approvalEntries.slice(0, 8).map(summarizeReflectionEntry))}

## Blocker Memory

${bulletList(blockerEntries.slice(0, 8).map(summarizeReflectionEntry))}

## Follow-Up Signals

${bulletList(
  followUpEntries.slice(0, 10).map(({ entry, signals }) => `**${entry.title}** - ${signals.join("; ")}`),
)}

## Source Record IDs

${bulletList(sourceRecords)}
`;

  return {
    title: `Receipt Reflection Digest - ${dateKey}`,
    sourcePath: `operating-briefs/reflections/${dateKey}-receipt-reflection-digest.md`,
    generatedAt: generatedAt.toISOString(),
    markdown,
    metrics: {
      recordsReviewed: entries.length,
      receipts: entriesWithReceipts.length,
      approvals: approvalEntries.length,
      blockers: blockerEntries.length,
      followUps: followUpEntries.length,
    },
    sourceRecords,
  };
}
