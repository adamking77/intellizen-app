import { hermesRest } from "@/engine/rest";
import type { WorkflowTemplateItem } from "@/lib/types";
import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";
import { workflowDispatchPrompt } from "@/services/agent";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  scheduleDisplay: string;
  prompt: string;
  enabled: boolean;
  state: string;
  profile: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
}

export interface CronJobCreate {
  name: string;
  schedule: string;
  prompt: string;
  deliver?: string;
  workdir?: string;
}

export interface CronJobRun {
  id: string;
  startedAt: string | null;
  endedAt: string | null;
  isActive: boolean;
  outcome: "completed" | "incomplete" | "running" | "unknown";
  preview: string;
}

export interface CronBlueprintField {
  name: string;
  type: "enum" | "text" | "time" | "weekdays" | string;
  default: unknown;
}

export interface CronBlueprint {
  key: string;
  title: string;
  schedule: string;
  scheduleHuman: string;
  fields: CronBlueprintField[];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

export function toCronJob(row: Record<string, unknown>): CronJob {
  return {
    id: text(row.id),
    name: text(row.name),
    schedule: text(row.schedule),
    scheduleDisplay: text(row.schedule_display, text(row.schedule)),
    prompt: text(row.prompt),
    enabled: row.enabled !== false,
    state: text(row.state, row.enabled === false ? "paused" : "scheduled"),
    profile: text(row.profile, "default"),
    lastRunAt: optionalText(row.last_run_at),
    nextRunAt: optionalText(row.next_run_at),
    lastStatus: optionalText(row.last_status),
  };
}

function profileQuery(profile: string) {
  return `?profile=${encodeURIComponent(profile)}`;
}

export async function listCronJobs(profile = "all") {
  const rows = await hermesRest<Record<string, unknown>[]>(`/api/cron/jobs${profileQuery(profile)}`);
  return (Array.isArray(rows) ? rows : []).map(toCronJob);
}

export async function createCronJob(profile: string, body: CronJobCreate) {
  const row = await hermesRest<Record<string, unknown>>(`/api/cron/jobs${profileQuery(profile)}`, {
    method: "POST",
    body: JSON.stringify({ deliver: "local", ...body }),
  });
  return toCronJob({ profile, ...row });
}

export async function runCronJobNow(profile: string, jobId: string) {
  const row = await hermesRest<Record<string, unknown>>(
    `/api/cron/jobs/${encodeURIComponent(jobId)}/trigger${profileQuery(profile)}`,
    { method: "POST" },
  );
  return toCronJob({ profile, ...row });
}

export async function pauseCronJob(profile: string, jobId: string) {
  const row = await hermesRest<Record<string, unknown>>(
    `/api/cron/jobs/${encodeURIComponent(jobId)}/pause${profileQuery(profile)}`,
    { method: "POST" },
  );
  return toCronJob({ profile, ...row });
}

export async function resumeCronJob(profile: string, jobId: string) {
  const row = await hermesRest<Record<string, unknown>>(
    `/api/cron/jobs/${encodeURIComponent(jobId)}/resume${profileQuery(profile)}`,
    { method: "POST" },
  );
  return toCronJob({ profile, ...row });
}

export async function listCronJobRuns(profile: string, jobId: string, limit = 5) {
  const result = await hermesRest<{ runs?: Array<Record<string, unknown>> }>(
    `/api/cron/jobs/${encodeURIComponent(jobId)}/runs${profileQuery(profile)}&limit=${limit}`,
  );
  return (result.runs ?? []).map((run): CronJobRun => {
    const endReason = text(run.end_reason);
    const isActive = run.is_active === true;
    return {
      id: text(run.id),
      startedAt: optionalText(run.started_at),
      endedAt: optionalText(run.ended_at),
      isActive,
      outcome: isActive
        ? "running"
        : endReason === "cron_complete"
          ? "completed"
          : endReason === "cron_incomplete_no_output" || /error|interrupt|fail/i.test(endReason)
            ? "incomplete"
            : "unknown",
      preview: text(run.preview),
    };
  });
}

export async function listCronBlueprints(): Promise<CronBlueprint[]> {
  const result = await hermesRest<{ blueprints?: Array<Record<string, unknown>> }>("/api/cron/blueprints");
  return (result.blueprints ?? []).flatMap((row) => {
    const key = text(row.key);
    const schedule = text(row.schedule);
    if (!key || !schedule) return [];
    const fields = Array.isArray(row.fields) ? row.fields.flatMap((field) => {
      if (!field || typeof field !== "object") return [];
      const value = field as Record<string, unknown>;
      const name = text(value.name);
      return name ? [{ name, type: text(value.type), default: value.default }] : [];
    }) : [];
    return [{
      key,
      title: text(row.title) || key,
      schedule,
      scheduleHuman: text(row.scheduleHuman) || schedule,
      fields,
    }];
  });
}

const DAY_NUMBER: Record<string, string> = {
  sunday: "0",
  monday: "1",
  tuesday: "2",
  wednesday: "3",
  thursday: "4",
  friday: "5",
  saturday: "6",
  everyday: "*",
  weekdays: "1-5",
  weekends: "0,6",
};

/** Resolve a catalog entry's default form values to the cron expression Hermes
 * would create. Entries with non-defaulted slots remain custom-only. */
export function defaultBlueprintSchedule(blueprint: CronBlueprint): string | null {
  const values = Object.fromEntries(blueprint.fields.map((field) => [field.name, field.default]));
  const time = typeof values.time === "string" ? values.time.match(/^(\d{1,2}):(\d{2})$/) : null;
  const dow = text(values.day ?? values.recurrence);
  const resolved = blueprint.schedule.replace(/\{([^}]+)\}/g, (_whole, name: string) => {
    if (name === "hour") return time?.[1] ?? "";
    if (name === "minute") return time?.[2] ?? "";
    if (name === "dow") return DAY_NUMBER[dow] ?? dow;
    return text(values[name]);
  });
  return resolved.includes("{") || resolved.trim().split(/\s+/).length !== 5 ? null : resolved;
}

export async function deleteCronJob(profile: string, jobId: string) {
  await hermesRest(`/api/cron/jobs/${encodeURIComponent(jobId)}${profileQuery(profile)}`, {
    method: "DELETE",
  });
}

export const WORKFLOW_CRON_PREFIX = "IntelliZen · ";

export function workflowCronName(workflow: Pick<WorkflowTemplateItem, "name">) {
  return `${WORKFLOW_CRON_PREFIX}${workflow.name}`;
}

export function scheduledWorkflowPrompt(input: {
  workflow: Pick<WorkflowTemplateItem, "workflow_id" | "name" | "definition_version">;
  definition: WorkflowDefinitionV1;
  schedule: string;
  kanban: { board: string; cards: Record<string, string> } | null;
}) {
  return workflowDispatchPrompt({
    kind: "scheduled-workflow",
    workflow_id: input.workflow.workflow_id,
    workflow_name: input.workflow.name,
    definition_version: input.workflow.definition_version,
    schedule: input.schedule,
    kanban: input.kanban ? { board: input.kanban.board } : null,
    steps: input.definition.steps.map((step) => ({
      id: step.id,
      kind: step.kind,
      title: step.title,
      ...(step.kind === "role-assign"
        ? { role: step.role, instructions: step.instructions, timeout_minutes: step.timeoutMinutes }
        : {}),
      ...(step.kind === "approval" ? { gate: step.gate } : {}),
      ...(step.kind === "condition" ? { expr: step.expr } : {}),
      ...(input.kanban?.cards[step.id] ? { card_id: input.kanban.cards[step.id] } : {}),
    })),
    prompt: [
      `Run the workflow "${input.workflow.name}" once, now, step by step in definition order.`,
      "Use the supplied definition as the task instructions. Do not inspect IntelliZen source, reconstruct dispatcher internals, calculate transition hashes, write helper files, or run tests unless the definition explicitly requires them.",
      "Create one ordinary Workflow Run with the IntelliZen start_workflow tool. Record progress and the final receipt with update_workflow_run; do not call raw SQL or the low-level advance_workflow_step tool from a cron session.",
      input.kanban
        ? `Update each named card on board "${input.kanban.board}" as its step moves through running, done, or blocked.`
        : "Report progress in the Hermes session.",
      "At an approval step, record the request with request_workflow_approval, then end this cron turn. Do not wait in process for Adam's answer.",
      "Finish with a concise status and the receipt locations for every state change.",
    ].join("\n"),
  });
}
