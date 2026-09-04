import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Pause, Play, Trash2 } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Control } from "@/components/ui/control";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ui/status-pill";
import type { WorkflowTemplateItem } from "@/lib/types";
import type { WorkflowDefinitionV1, WorkflowStep } from "@/lib/workflow-schema";
import { errorMessage, toast } from "@/lib/toast";
import { fetchHermesProfiles } from "@/services/agent";
import {
  CRON_PRESETS,
  createCronJob,
  deleteCronJob,
  listCronJobRuns,
  listCronJobs,
  pauseCronJob,
  resumeCronJob,
  runCronJobNow,
  scheduledWorkflowPrompt,
  workflowCronName,
} from "@/services/hermes-cron";
import { createKanbanCard, listKanbanBoards } from "@/services/hermes-kanban";

interface ScheduleSheetProps {
  open: boolean;
  workflow: WorkflowTemplateItem;
  definition: WorkflowDefinitionV1;
  onOpenChange: (open: boolean) => void;
}

function nextRunLabel(value: string | null) {
  if (!value) return "Next run not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `Next ${date.toLocaleString()}`;
}

function stepBody(workflow: WorkflowTemplateItem, step: WorkflowStep, schedule: string) {
  return [
    `Workflow: ${workflow.name} (${workflow.workflow_id})`,
    `Scheduled: ${schedule}`,
    `Step: ${step.id} · ${step.kind}`,
    step.kind === "role-assign" ? step.instructions : `Complete “${step.title}” according to the workflow definition.`,
    "This card is progress data for the scheduled workflow; the Hermes cron session owns execution.",
  ].join("\n\n");
}

export function ScheduleSheet({ open, workflow, definition, onOpenChange }: ScheduleSheetProps) {
  const [schedule, setSchedule] = useState<string>(CRON_PRESETS[2].expression);
  const [profile, setProfile] = useState("");
  const [board, setBoard] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());

  const profilesQuery = useQuery({
    queryKey: ["workflow-schedule", "profiles"],
    queryFn: fetchHermesProfiles,
    enabled: open,
    staleTime: 30_000,
  });
  const boardsQuery = useQuery({
    queryKey: ["workflow-schedule", "boards"],
    queryFn: listKanbanBoards,
    enabled: open,
    staleTime: 15_000,
  });
  const jobsQuery = useQuery({
    queryKey: ["workflow-schedule", "jobs"],
    queryFn: () => listCronJobs("all"),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  useEffect(() => {
    if (!open) return;
    setFailure(null);
    setConfirmDelete(null);
    setOperationId(crypto.randomUUID());
  }, [open, workflow.id]);

  useEffect(() => {
    if (profile || !profilesQuery.data?.length) return;
    setProfile(profilesQuery.data.find((item) => item.isDefault)?.name ?? profilesQuery.data[0].name);
  }, [profile, profilesQuery.data]);

  const jobs = useMemo(
    () => (jobsQuery.data ?? []).filter((job) =>
      job.name === workflowCronName(workflow) || job.prompt.includes(`"workflow_id": "${workflow.workflow_id}"`),
    ),
    [jobsQuery.data, workflow],
  );
  const runsQuery = useQuery({
    queryKey: ["workflow-schedule", "runs", jobs.map((job) => job.id).join("\n")],
    queryFn: async () => Object.fromEntries(await Promise.all(jobs.map(async (job) => [job.id, await listCronJobRuns(job.profile, job.id)] as const))),
    enabled: open && jobs.length > 0,
    refetchInterval: open ? 15_000 : false,
  });
  const validSchedule = schedule.trim().split(/\s+/).length === 5;
  const canCreate = Boolean(profile && validSchedule && !saving);

  async function save() {
    if (!canCreate) return;
    setSaving(true);
    setFailure(null);
    const cards: Record<string, string> = {};
    try {
      if (board) {
        for (const step of definition.steps) {
          const card = await createKanbanCard(board, {
            title: `${workflow.name} · ${step.title}`,
            body: stepBody(workflow, step, schedule),
            assignee: profile,
            idempotencyKey: `intellizen:${operationId}:${step.id}`,
          });
          cards[step.id] = card.id;
        }
      }
      await createCronJob(profile, {
        name: workflowCronName(workflow),
        schedule: schedule.trim(),
        prompt: scheduledWorkflowPrompt({
          workflow,
          definition,
          schedule: schedule.trim(),
          kanban: board ? { board, cards } : null,
        }),
      });
      await jobsQuery.refetch();
      setOperationId(crypto.randomUUID());
      toast.success("Workflow scheduled", {
        description: board
          ? `${definition.steps.length} progress cards created on ${board}.`
          : "The run will report in its Hermes session.",
      });
    } catch (error) {
      const partial = Object.keys(cards).length;
      setFailure(
        partial > 0
          ? `${errorMessage(error)} ${partial} progress ${partial === 1 ? "card was" : "cards were"} created; retrying here reuses them.`
          : errorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function runNow(jobId: string, jobProfile: string) {
    setActionId(jobId);
    setFailure(null);
    try {
      await runCronJobNow(jobProfile, jobId);
      await jobsQuery.refetch();
      toast.success("Scheduled workflow started");
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  async function toggle(jobId: string, jobProfile: string, enabled: boolean) {
    setActionId(jobId);
    setFailure(null);
    try {
      if (enabled) await pauseCronJob(jobProfile, jobId);
      else await resumeCronJob(jobProfile, jobId);
      await jobsQuery.refetch();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  async function remove(jobId: string, jobProfile: string) {
    if (confirmDelete !== jobId) {
      setConfirmDelete(jobId);
      return;
    }
    setActionId(jobId);
    setFailure(null);
    try {
      await deleteCronJob(jobProfile, jobId);
      setConfirmDelete(null);
      await jobsQuery.refetch();
      toast.success("Schedule removed");
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  return (
    <AppDialog
      className="w-[min(680px,calc(100vw-2rem))] max-w-[680px]"
      description="Choose when Hermes runs this definition and whether its steps also appear as ordinary kanban cards."
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      open={open}
      title={`Schedule ${workflow.name}`}
      footer={
        <>
          <Control disabled={saving} onClick={() => onOpenChange(false)} variant="quiet">Close</Control>
          <Control disabled={!canCreate} loading={saving} onClick={() => void save()} variant="primary">
            {!saving ? <CalendarClock className="h-3.5 w-3.5" /> : null}
            {saving ? "Creating…" : "Create schedule"}
          </Control>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <div className="mb-2 font-ui text-[var(--t-count)] font-light uppercase tracking-[0.1em] text-[var(--overlay-1)]">When</div>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((preset) => (
              <Control
                size="sm"
                variant={schedule === preset.expression ? "selected" : "quiet"}
                key={preset.expression}
                onClick={() => setSchedule(preset.expression)}
              >
                {preset.label}
              </Control>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="sr-only">Cron expression</span>
            <Input
              aria-invalid={!validSchedule}
              className="font-mono"
              onChange={(event) => setSchedule(event.target.value)}
              value={schedule}
            />
          </label>
          {!validSchedule ? <p className="mt-1 font-ui text-[var(--t-count)] text-[var(--danger)]">Use a five-part cron expression.</p> : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block font-ui text-[var(--t-count)] font-light uppercase tracking-[0.1em] text-[var(--overlay-1)]">Hermes profile</span>
            <Select
              disabled={profilesQuery.isLoading}
              onChange={(event) => setProfile(event.target.value)}
              value={profile}
            >
              <option value="">Choose profile</option>
              {(profilesQuery.data ?? []).map((item) => <option key={item.name} value={item.name}>{item.displayName || item.name}</option>)}
            </Select>
          </label>
          <label>
            <span className="mb-1.5 block font-ui text-[var(--t-count)] font-light uppercase tracking-[0.1em] text-[var(--overlay-1)]">Progress board</span>
            <Select
              disabled={boardsQuery.isLoading}
              onChange={(event) => setBoard(event.target.value)}
              value={board}
            >
              <option value="">Hermes session only</option>
              {(boardsQuery.data ?? []).map((item) => <option key={item.slug} value={item.slug}>{item.name} · {item.total}</option>)}
            </Select>
          </label>
        </section>

        <div className="rounded-[var(--r-ctl)] border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 font-ui text-[var(--t-section)] leading-relaxed text-[var(--subtext-0)]">
          Hermes will run the saved definition as <span className="font-mono text-[var(--text)]">{profile || "the selected profile"}</span>.
          {board ? ` ${definition.steps.length} idempotent progress cards will be created on ${board}.` : " No board data will be created."}
        </div>

        {profilesQuery.error || boardsQuery.error || jobsQuery.error || failure ? (
          <div role="alert" className="rounded-[var(--r-ctl)] border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--base))] px-3 py-2 font-ui text-[var(--t-section)] text-[var(--danger)]">
            {failure ?? errorMessage(profilesQuery.error ?? boardsQuery.error ?? jobsQuery.error)}
          </div>
        ) : null}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.1em] text-[var(--overlay-1)]">Existing schedules</span>
            {jobsQuery.isFetching ? <span className="control-running-dot" aria-label="Refreshing schedules" /> : null}
          </div>
          {jobs.length ? (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div className="flex items-center gap-3 rounded-[var(--r-ctl)] border border-[var(--border)] bg-[var(--base)] px-3 py-2" key={job.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-ui text-[var(--t-meta)] font-medium text-[var(--text)]">{job.scheduleDisplay}</span>
                      <Pill variant={job.lastStatus === "error" ? "failure" : "neutral"}>{job.state}</Pill>
                    </div>
                    <p className="mt-0.5 truncate font-ui text-[var(--t-count)] text-[var(--overlay-1)]">{job.profile} · {nextRunLabel(job.nextRunAt)}</p>
                    {runsQuery.isLoading ? <Skeleton lines={1} className="mt-1" /> : runsQuery.data?.[job.id]?.[0] ? <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">Last outcome · {runsQuery.data[job.id][0].isActive ? "Running" : runsQuery.data[job.id][0].endedAt ? "Finished" : "Interrupted"}</p> : null}
                  </div>
                  <Control aria-label={`${job.enabled ? "Pause" : "Resume"} ${job.scheduleDisplay}`} disabled={actionId === job.id} onClick={() => void toggle(job.id, job.profile, job.enabled)} size="icon" variant="quiet">
                    {job.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Control>
                  <Control aria-label={`Run ${job.scheduleDisplay} now`} disabled={actionId === job.id} onClick={() => void runNow(job.id, job.profile)} size="icon" variant="quiet">
                    <Play className="h-3.5 w-3.5" />
                  </Control>
                  <Control
                    aria-label={confirmDelete === job.id ? `Confirm delete ${job.scheduleDisplay}` : `Delete ${job.scheduleDisplay}`}
                    disabled={actionId === job.id}
                    onClick={() => void remove(job.id, job.profile)}
                    size={confirmDelete === job.id ? "sm" : "icon"}
                    variant={confirmDelete === job.id ? "danger" : "quiet"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmDelete === job.id ? "Delete?" : null}
                  </Control>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 font-ui text-[var(--t-section)] text-[var(--overlay-1)]">Schedules you create will appear here.</p>
          )}
        </section>
      </div>
    </AppDialog>
  );
}
