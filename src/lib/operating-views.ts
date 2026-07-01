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
