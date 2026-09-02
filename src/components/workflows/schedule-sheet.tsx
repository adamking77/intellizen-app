import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2, Play, Trash2 } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WorkflowTemplateItem } from "@/lib/types";
import type { WorkflowDefinitionV1, WorkflowStep } from "@/lib/workflow-schema";
import { errorMessage, toast } from "@/lib/toast";
import { fetchHermesProfiles } from "@/services/agent";
import {
  CRON_PRESETS,
  createCronJob,
  deleteCronJob,
  listCronJobs,
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
          <Button disabled={saving} onClick={() => onOpenChange(false)} variant="ghost">Close</Button>
          <Button disabled={!canCreate} onClick={() => void save()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
            {saving ? "Creating…" : "Create schedule"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <div className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--overlay-1)]">When</div>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((preset) => (
              <button
                className={`rounded-full border px-2.5 py-1 font-ui text-[10.5px] transition-colors ${
                  schedule === preset.expression
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--overlay-1)] hover:text-[var(--text)]"
                }`}
                key={preset.expression}
                onClick={() => setSchedule(preset.expression)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="sr-only">Cron expression</span>
            <input
              aria-invalid={!validSchedule}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-3 font-mono text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
              onChange={(event) => setSchedule(event.target.value)}
              value={schedule}
            />
          </label>
          {!validSchedule ? <p className="mt-1 font-ui text-[10.5px] text-[var(--danger)]">Use a five-part cron expression.</p> : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--overlay-1)]">Hermes profile</span>
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
              disabled={profilesQuery.isLoading}
              onChange={(event) => setProfile(event.target.value)}
              value={profile}
            >
              <option value="">Choose profile</option>
              {(profilesQuery.data ?? []).map((item) => <option key={item.name} value={item.name}>{item.displayName || item.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--overlay-1)]">Progress board</span>
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
              disabled={boardsQuery.isLoading}
              onChange={(event) => setBoard(event.target.value)}
              value={board}
            >
              <option value="">Hermes session only</option>
              {(boardsQuery.data ?? []).map((item) => <option key={item.slug} value={item.slug}>{item.name} · {item.total}</option>)}
            </select>
          </label>
        </section>

        <div className="rounded-md border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 font-ui text-[11px] leading-relaxed text-[var(--subtext-0)]">
          Hermes will run the saved definition as <span className="font-mono text-[var(--text)]">{profile || "the selected profile"}</span>.
          {board ? ` ${definition.steps.length} idempotent progress cards will be created on ${board}.` : " No board data will be created."}
        </div>

        {profilesQuery.error || boardsQuery.error || jobsQuery.error || failure ? (
          <div role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--base))] px-3 py-2 font-ui text-[11px] text-[var(--danger)]">
            {failure ?? errorMessage(profilesQuery.error ?? boardsQuery.error ?? jobsQuery.error)}
          </div>
        ) : null}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--overlay-1)]">Existing schedules</span>
            {jobsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--overlay-1)]" /> : null}
          </div>
          {jobs.length ? (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--base)] px-3 py-2" key={job.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-ui text-[12px] font-medium text-[var(--text)]">{job.scheduleDisplay}</span>
                      <Badge variant={job.lastStatus === "error" ? "destructive" : "secondary"}>{job.state}</Badge>
                    </div>
                    <p className="mt-0.5 truncate font-ui text-[10.5px] text-[var(--overlay-1)]">{job.profile} · {nextRunLabel(job.nextRunAt)}</p>
                  </div>
                  <Button aria-label={`Run ${job.scheduleDisplay} now`} disabled={actionId === job.id} onClick={() => void runNow(job.id, job.profile)} size="icon" variant="ghost">
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    aria-label={confirmDelete === job.id ? `Confirm delete ${job.scheduleDisplay}` : `Delete ${job.scheduleDisplay}`}
                    disabled={actionId === job.id}
                    onClick={() => void remove(job.id, job.profile)}
                    size={confirmDelete === job.id ? "sm" : "icon"}
                    variant={confirmDelete === job.id ? "destructive" : "ghost"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmDelete === job.id ? "Delete?" : null}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center font-ui text-[11px] text-[var(--overlay-1)]">No schedules for this workflow.</div>
          )}
        </section>
      </div>
    </AppDialog>
  );
}
