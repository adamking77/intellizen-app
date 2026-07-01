import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, CheckCircle2, ExternalLink, Mic, MicOff, PanelRightClose, PanelRightOpen, Play, RefreshCw, Square, Volume2 } from "lucide-react";
import { Link } from "react-router-dom";

import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkflowRuns, listWorkflows, startWorkflow, updateWorkflowRun } from "@/lib/data";
import type { WorkflowRunItem, WorkflowRunStatus } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "intelizen:agent-panel-collapsed";
const WORKFLOW_RUNS_DATABASE_ID = GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns;
const RUN_BOARD_VIEW_ID = "c2000000-0000-0000-0000-000000000102";
const APPROVAL_QUEUE_VIEW_ID = "c2000000-0000-0000-0000-000000000103";

type RunAction = "start" | "request_approval" | "approve" | "block" | "done";

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: {
      transcript: string;
    };
  }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function readCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function workflowRunsUrl(viewId: string) {
  return `/databases?database=${WORKFLOW_RUNS_DATABASE_ID}&view=${viewId}`;
}

function formatRunTime(value: string | null) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "needs approval") return "border-[color-mix(in_srgb,var(--caution)_42%,transparent)] text-[var(--caution)]";
  if (normalized === "blocked") return "border-[color-mix(in_srgb,var(--danger)_38%,transparent)] text-[var(--danger)]";
  if (normalized === "done") return "border-[color-mix(in_srgb,var(--success)_38%,transparent)] text-[var(--success)]";
  if (normalized === "in progress") return "border-[color-mix(in_srgb,var(--info)_38%,transparent)] text-[var(--info)]";
  return "border-[var(--border)] text-[var(--subtext-0)]";
}

function runTitle(run: WorkflowRunItem) {
  return run.name.trim() || "Untitled workflow run";
}

function actionLabel(action: RunAction) {
  if (action === "start") return "Start";
  if (action === "request_approval") return "Approval";
  if (action === "approve") return "Approve";
  if (action === "block") return "Block";
  return "Done";
}

function actionConfig(action: RunAction, run: WorkflowRunItem): {
  status: WorkflowRunStatus;
  currentStep: string;
  summary: string;
  actionsTaken: string[];
  approvalNeeded?: string | null;
  blockedItems?: string[];
  nextStep?: string | null;
} {
  const title = runTitle(run);
  if (action === "start") {
    return {
      status: "In progress",
      currentStep: "Execution underway",
      summary: `Started ${title} from the Agent Panel.`,
      actionsTaken: ["Started workflow run from Agent Panel"],
      nextStep: "Execute the registered workflow steps",
    };
  }
  if (action === "request_approval") {
    return {
      status: "Needs approval",
      currentStep: "Awaiting approval",
      summary: `Requested approval for ${title} from the Agent Panel.`,
      actionsTaken: ["Requested approval from Agent Panel"],
      approvalNeeded: "Approval requested from Agent Panel",
      nextStep: "Await approval decision",
    };
  }
  if (action === "approve") {
    return {
      status: "In progress",
      currentStep: "Approval granted",
      summary: `Approved ${title} from the Agent Panel.`,
      actionsTaken: ["Resolved approval as approved from Agent Panel"],
      approvalNeeded: null,
      nextStep: "Resume workflow execution",
    };
  }
  if (action === "block") {
    return {
      status: "Blocked",
      currentStep: "Blocked from Agent Panel",
      summary: `Blocked ${title} from the Agent Panel.`,
      actionsTaken: ["Blocked workflow run from Agent Panel"],
      blockedItems: ["Blocked from Agent Panel"],
      nextStep: "Review blocker and decide next action",
    };
  }
  return {
    status: "Done",
    currentStep: "Completed from Agent Panel",
    summary: `Marked ${title} done from the Agent Panel.`,
    actionsTaken: ["Marked workflow run done from Agent Panel"],
    nextStep: "Review receipt and archive if appropriate",
  };
}

function actionsForRun(run: WorkflowRunItem): RunAction[] {
  const status = run.status?.trim().toLowerCase();
  if (status === "queued") return ["start", "request_approval", "block"];
  if (status === "in progress") return ["request_approval", "done", "block"];
  if (status === "needs approval") return ["approve", "block"];
  if (status === "blocked") return ["start"];
  return [];
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const voiceWindow = window as VoiceWindow;
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null;
}

function supportsSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function buildVoiceBrief(approvals: WorkflowRunItem[], runs: WorkflowRunItem[]) {
  const lines: string[] = [];
  if (approvals.length > 0) {
    lines.push(`${approvals.length} approval${approvals.length === 1 ? "" : "s"} waiting.`);
    for (const run of approvals.slice(0, 3)) {
      lines.push(`${runTitle(run)}. ${run.current_step ?? "Awaiting decision."}`);
    }
  } else {
    lines.push("No approvals waiting.");
  }

  if (runs.length > 0) {
    lines.push(`${runs.length} active workflow${runs.length === 1 ? "" : "s"}.`);
    for (const run of runs.slice(0, 3)) {
      lines.push(`${runTitle(run)} is ${run.status ?? "active"}. ${run.current_step ?? ""}`.trim());
    }
  } else {
    lines.push("No active workflows.");
  }

  return lines.join(" ");
}

export function AgentPanel() {
  const [collapsed, setCollapsed] = useState(() => readCollapsed());
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [isStartingWorkflow, setIsStartingWorkflow] = useState(false);
  const [updatingRunId, setUpdatingRunId] = useState<string | null>(null);
  const [voiceDraft, setVoiceDraft] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const { isCramped } = useWindowSize();

  const workflowsQuery = useQuery({
    queryKey: ["workflows", "agent-panel", "active"],
    queryFn: () => listWorkflows({ includeInactive: false, limit: 24 }),
    staleTime: 60_000,
  });
  const activeRunsQuery = useQuery({
    queryKey: ["workflow-runs", "agent-panel", "active"],
    queryFn: () => listWorkflowRuns({ includeCompleted: false, limit: 8 }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  const approvalsQuery = useQuery({
    queryKey: ["workflow-runs", "agent-panel", "approvals"],
    queryFn: () => listWorkflowRuns({ status: "Needs approval", includeCompleted: true, limit: 8 }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const activeRuns = activeRunsQuery.data ?? [];
  const approvals = approvalsQuery.data ?? [];
  const workflows = workflowsQuery.data ?? [];
  const selectedWorkflow = workflows.find((workflow) => workflow.workflow_id === selectedWorkflowId) ?? workflows[0] ?? null;
  const activeWorkflowId = selectedWorkflowId || selectedWorkflow?.workflow_id || "";
  const isFetching = workflowsQuery.isFetching || activeRunsQuery.isFetching || approvalsQuery.isFetching;
  const error = workflowsQuery.error ?? activeRunsQuery.error ?? approvalsQuery.error;
  const canListen = Boolean(getSpeechRecognitionConstructor());
  const canSpeak = supportsSpeechSynthesis();

  const visibleRuns = useMemo(() => {
    const approvalIds = new Set(approvals.map((run) => run.id));
    return activeRuns.filter((run) => !approvalIds.has(run.id)).slice(0, 5);
  }, [activeRuns, approvals]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (supportsSpeechSynthesis()) window.speechSynthesis.cancel();
    };
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function refresh() {
    await Promise.all([
      workflowsQuery.refetch(),
      activeRunsQuery.refetch(),
      approvalsQuery.refetch(),
    ]);
  }

  async function handleStartWorkflow() {
    if (!activeWorkflowId || isStartingWorkflow) return;

    try {
      setIsStartingWorkflow(true);
      const result = await startWorkflow({
        workflowId: activeWorkflowId,
        triggerSource: "ui",
        requestedBy: "Adam",
        entityScope: selectedWorkflow?.entity ?? undefined,
        context: {
          route: typeof window === "undefined" ? null : window.location.pathname,
          source: voiceDraft.trim() ? "agent_panel_voice" : "agent_panel",
          voice_transcript: voiceDraft.trim() || null,
        },
        confirmWrite: true,
      });
      await refresh();
      toast.success("Workflow run started", {
        description: result.run?.name ?? result.workflow_run_id,
      });
    } catch (startError) {
      toastError("Workflow start failed", startError);
    } finally {
      setIsStartingWorkflow(false);
    }
  }

  function startVoiceDraft() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      toast.error("Speech recognition unavailable");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText.trim()) {
        setVoiceDraft((current) => `${current}${current.trim() ? " " : ""}${finalText.trim()}`);
      }
      if (interimText.trim() && !finalText.trim()) {
        setVoiceDraft((current) => current.replace(/\s+\[[^\]]+\]$/, "") + ` [${interimText.trim()}]`);
      }
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      toast.error("Speech recognition stopped", {
        description: event.error ?? "Recognition error",
      });
    };
    recognition.onend = () => {
      setIsListening(false);
      setVoiceDraft((current) => current.replace(/\s+\[[^\]]+\]$/, "").trim());
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function speakBrief() {
    if (!canSpeak) {
      toast.error("Speech output unavailable");
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(buildVoiceBrief(approvals, visibleRuns));
    utterance.rate = 0.94;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  }

  async function handleRunAction(run: WorkflowRunItem, action: RunAction) {
    if (updatingRunId) return;
    const config = actionConfig(action, run);

    try {
      setUpdatingRunId(run.id);
      const result = await updateWorkflowRun({
        workflowRunId: run.id,
        actor: "Adam",
        status: config.status,
        currentStep: config.currentStep,
        summary: config.summary,
        actionsTaken: config.actionsTaken,
        verification: ["Updated from IntelliZen Agent Panel"],
        blockedItems: config.blockedItems,
        approvalNeeded: config.approvalNeeded,
        nextStep: config.nextStep,
        confirmWrite: true,
      });
      await refresh();
      toast.success("Workflow run updated", {
        description: result.run ? `${result.run.name}: ${result.run.status}` : runTitle(run),
      });
    } catch (actionError) {
      toastError("Workflow update failed", actionError);
    } finally {
      setUpdatingRunId(null);
    }
  }

  if (collapsed || isCramped) {
    return (
      <aside className="flex h-dvh w-12 shrink-0 flex-col items-center border-l border-[var(--border)] bg-[var(--mantle)] py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand agent panel"
          title="Expand agent panel"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--accent)]">
            <Bot className="h-4 w-4" />
          </span>
          {approvals.length > 0 ? (
            <span className="rounded-full border border-[color-mix(in_srgb,var(--caution)_42%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--caution)]">
              {approvals.length}
            </span>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-dvh w-[336px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--mantle)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--accent)]">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-ui text-[13px] font-semibold text-[var(--text)]">Agent Panel</p>
            <p className="truncate font-ui text-[11px] text-[var(--overlay-1)]">Workflow Runs</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh agent panel"
            title="Refresh"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse agent panel"
            title="Collapse agent panel"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {error ? (
          <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3">
            <p className="font-ui text-[12px] font-medium text-[var(--danger)]">Workflow Runs unavailable</p>
            <p className="mt-1 line-clamp-3 font-ui text-[11px] text-[var(--subtext-0)]">
              {error instanceof Error ? error.message : "Refresh failed."}
            </p>
          </div>
        ) : null}

        <section className="mb-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Start Workflow</h2>
            <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--subtext-0)]">
              {workflows.length}
            </span>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--base)] p-2.5">
            <select
              value={activeWorkflowId}
              onChange={(event) => setSelectedWorkflowId(event.target.value)}
              disabled={workflows.length === 0 || isStartingWorkflow}
              aria-label="Workflow"
              className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-ui text-[12px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent-border)] disabled:opacity-50"
            >
              {workflows.length === 0 ? (
                <option value="">No workflows</option>
              ) : (
                workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.workflow_id}>
                    {workflow.name}
                  </option>
                ))
              )}
            </select>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-ui text-[10.5px] text-[var(--overlay-1)]">
                {selectedWorkflow?.default_actor ?? selectedWorkflow?.owner_role ?? "No actor"}
              </span>
              <button
                type="button"
                onClick={handleStartWorkflow}
                disabled={!activeWorkflowId || isStartingWorkflow}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 font-ui text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-50"
              >
                {isStartingWorkflow ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Start
              </button>
            </div>
          </div>
        </section>

        <section className="mb-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Voice</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startVoiceDraft}
                disabled={!canListen}
                aria-label={isListening ? "Stop dictation" : "Start dictation"}
                title={isListening ? "Stop dictation" : "Start dictation"}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-40",
                  isListening
                    ? "border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                    : "border-[var(--border)] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                )}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={speakBrief}
                disabled={!canSpeak}
                aria-label={isSpeaking ? "Stop speaking" : "Speak brief"}
                title={isSpeaking ? "Stop speaking" : "Speak brief"}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-40",
                  isSpeaking
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                )}
              >
                {isSpeaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <textarea
            value={voiceDraft}
            onChange={(event) => setVoiceDraft(event.target.value)}
            rows={3}
            placeholder="Dictated context"
            className="min-h-[76px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 py-2 font-ui text-[12px] leading-relaxed text-[var(--text)] outline-none transition-colors placeholder:text-[var(--overlay-1)] focus:border-[var(--accent-border)]"
          />
          {voiceDraft.trim() ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setVoiceDraft("")}
                className="inline-flex h-6 items-center justify-center rounded border border-[var(--border)] px-2 font-ui text-[10.5px] font-medium text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                Clear
              </button>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <PanelSectionHeader
            label="Approvals"
            count={approvals.length}
            to={workflowRunsUrl(APPROVAL_QUEUE_VIEW_ID)}
          />
          {approvals.length > 0 ? (
            approvals.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                approval
                updating={updatingRunId === run.id}
                onAction={handleRunAction}
              />
            ))
          ) : (
            <EmptyState label="No pending approvals" icon={<CheckCircle2 className="h-4 w-4" />} />
          )}
        </section>

        <section className="mt-5 space-y-2">
          <PanelSectionHeader
            label="Active Runs"
            count={visibleRuns.length}
            to={workflowRunsUrl(RUN_BOARD_VIEW_ID)}
          />
          {visibleRuns.length > 0 ? (
            visibleRuns.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                updating={updatingRunId === run.id}
                onAction={handleRunAction}
              />
            ))
          ) : (
            <EmptyState label={isFetching ? "Loading runs" : "No active runs"} icon={<RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />} />
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <Link
          to={workflowRunsUrl(RUN_BOARD_VIEW_ID)}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-transparent px-3 font-ui text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Workflow Runs
        </Link>
      </div>
    </aside>
  );
}

function PanelSectionHeader({ label, count, to }: { label: string; count: number; to: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">{label}</h2>
        <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--subtext-0)]">
          {count}
        </span>
      </div>
      <Link
        to={to}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
        aria-label={`${label} view`}
        title={label}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function RunCard({
  run,
  approval = false,
  updating = false,
  onAction,
}: {
  run: WorkflowRunItem;
  approval?: boolean;
  updating?: boolean;
  onAction?: (run: WorkflowRunItem, action: RunAction) => void;
}) {
  const actions = actionsForRun(run);
  return (
    <article className="rounded-md border border-[var(--border)] bg-[var(--base)] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 min-w-0 font-ui text-[12px] font-medium leading-snug text-[var(--text)]">
          {runTitle(run)}
        </p>
        <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 font-ui text-[10px] font-medium", statusTone(run.status))}>
          {run.status ?? "No status"}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {run.current_step ? (
          <p className="line-clamp-2 font-ui text-[11px] leading-snug text-[var(--subtext-0)]">{run.current_step}</p>
        ) : null}
        <div className="flex items-center justify-between gap-2 font-ui text-[10.5px] text-[var(--overlay-1)]">
          <span className="truncate">{run.actor ?? run.owner_role ?? "Unassigned"}</span>
          <span className="shrink-0">{formatRunTime(run.updated_at)}</span>
        </div>
      </div>
      {approval ? (
        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2 font-ui text-[10.5px] text-[var(--caution)]">
          {run.receipt || run.body_preview || "Approval required"}
        </div>
      ) : null}
      {onAction && actions.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(run, action)}
              disabled={updating}
              className={cn(
                "inline-flex h-6 items-center justify-center rounded border px-2 font-ui text-[10.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                action === "block"
                  ? "border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                  : action === "done" || action === "approve"
                    ? "border-[color-mix(in_srgb,var(--success)_34%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]"
                    : "border-[var(--accent-border)] text-[var(--accent)] hover:bg-[var(--accent-soft)]",
              )}
            >
              {updating ? "..." : actionLabel(action)}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
      {icon}
      <span>{label}</span>
    </div>
  );
}
