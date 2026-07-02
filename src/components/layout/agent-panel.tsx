import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ExternalLink, MessageSquare, Mic, MicOff, PanelRightClose, PanelRightOpen, Play, Plus, RefreshCw, Send, Square, Volume2 } from "lucide-react";
import { Link } from "react-router-dom";

import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { parseAgentChatResult, type AgentChatWidget as AgentChatWidgetModel } from "@/lib/agent-widgets";

import {
  createVoiceDraftTask,
  GENZEN_WORKSPACE_DATABASE_IDS,
  listFionaInboxItems,
  listWorkflowRuns,
  listWorkflows,
  OPERATOR_ACTOR,
  WORKFLOW_RUN_VIEW_IDS,
} from "@/lib/data";
import type { FionaInboxItem, WorkflowRunItem } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { sendToAgentChat } from "@/services/agent";
import {
  getPreferredVoiceInputProvider,
  getPreferredVoiceOutputProvider,
  getVoiceProviderStatus,
  speakWithHermes,
  startBrowserDictation,
  supportsBrowserSpeechSynthesis,
  transcribeWithHermes,
} from "@/services/voice";
import type { BrowserDictationSession, VoiceProviderId } from "@/services/voice";

const STORAGE_KEY = "intelizen:agent-panel-collapsed";
const CHAT_HISTORY_KEY = "intelizen:agent-panel-chat-history";
const WORKFLOW_RUNS_DATABASE_ID = GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns;

// Run/approval actions live in the Databases-native Workflow Run views and
// record peek panels; the panel only surfaces counts and deep links.
type ChatEntryStatus = "submitted" | "queued" | "failed";

interface AgentChatEntry {
  id: string;
  message: string;
  targetAgent: string;
  status: ChatEntryStatus;
  detail: string;
  createdAt: string;
  /** Agent reply text parsed from the completed inbox result. */
  reply?: string | null;
  /** In-chat GenUI widget (agent-native data-widget contract). */
  widget?: AgentChatWidgetModel | null;
}

interface ChatPayloadContext {
  kind?: unknown;
  target_agent?: unknown;
  message?: unknown;
}

function readCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function readChatHistory() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is AgentChatEntry =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        typeof entry.message === "string" &&
        typeof entry.targetAgent === "string" &&
        typeof entry.status === "string" &&
        typeof entry.detail === "string" &&
        typeof entry.createdAt === "string",
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function workflowRunsUrl(viewId: string) {
  return `/databases?database=${WORKFLOW_RUNS_DATABASE_ID}&view=${viewId}`;
}

const RUN_BOARD_URL = workflowRunsUrl(WORKFLOW_RUN_VIEW_IDS.runBoard);
const APPROVAL_QUEUE_URL = workflowRunsUrl(WORKFLOW_RUN_VIEW_IDS.approvalQueue);

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

function runTitle(run: WorkflowRunItem) {
  return run.name.trim() || "Untitled workflow run";
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

function isChatInboxItem(item: FionaInboxItem) {
  const context = item.context as ChatPayloadContext | null;
  return context?.kind === "chat_message" || item.task.startsWith("Direct chat message for ");
}

function inboxItemToChatEntry(item: FionaInboxItem): AgentChatEntry {
  const context = item.context as ChatPayloadContext | null;
  const message = typeof context?.message === "string" ? context.message : item.task;
  const targetAgent =
    typeof context?.target_agent === "string"
      ? context.target_agent
      : item.task.replace(/^Direct chat message for\s+/, "").split(":")[0]?.trim() || "Fiona/Hermes";
  const status: ChatEntryStatus =
    item.status === "blocked" ? "failed" : item.status === "pending" || item.status === "in_progress" ? "queued" : "submitted";
  const { reply, widget } = item.status === "complete" ? parseAgentChatResult(item.result) : { reply: null, widget: null };
  return {
    id: item.id,
    message,
    targetAgent,
    status,
    detail: item.status,
    createdAt: item.updated_at ?? item.created_at,
    reply,
    widget,
  };
}

export function AgentPanel() {
  const [collapsed, setCollapsed] = useState(() => readCollapsed());
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [voiceDraft, setVoiceDraft] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCreatingVoiceTask, setIsCreatingVoiceTask] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatEntries, setChatEntries] = useState<AgentChatEntry[]>(() => readChatHistory());
  const dictationRef = useRef<BrowserDictationSession | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { isCramped } = useWindowSize();
  // Rail mode keeps the approvals badge alive but stops background polling.
  const expanded = !collapsed && !isCramped;

  const workflowsQuery = useQuery({
    queryKey: ["workflows", "agent-panel", "active"],
    queryFn: () => listWorkflows({ includeInactive: false, limit: 24 }),
    staleTime: 60_000,
    enabled: expanded,
  });
  const activeRunsQuery = useQuery({
    queryKey: ["workflow-runs", "agent-panel", "active"],
    queryFn: () => listWorkflowRuns({ includeCompleted: false, limit: 8 }),
    refetchInterval: expanded ? 60_000 : false,
    staleTime: 20_000,
    enabled: expanded,
  });
  const approvalsQuery = useQuery({
    queryKey: ["workflow-runs", "agent-panel", "approvals"],
    queryFn: () => listWorkflowRuns({ status: "Needs approval", includeCompleted: true, limit: 8 }),
    refetchInterval: expanded ? 60_000 : false,
    staleTime: 20_000,
  });
  const agentChatQuery = useQuery({
    queryKey: ["agent-panel", "chat-receipts"],
    queryFn: () => listFionaInboxItems({ limit: 8 }),
    refetchInterval: expanded ? 60_000 : false,
    staleTime: 20_000,
    enabled: expanded,
  });
  const { isStartingWorkflow, start: startWorkflowFromPanel } = useStartWorkflow({
    onStarted: () => refresh(),
  });

  const activeRuns = activeRunsQuery.data ?? [];
  const approvals = approvalsQuery.data ?? [];
  const workflows = workflowsQuery.data ?? [];
  const selectedWorkflow = workflows.find((workflow) => workflow.workflow_id === selectedWorkflowId) ?? workflows[0] ?? null;
  const activeWorkflowId = selectedWorkflowId || selectedWorkflow?.workflow_id || "";
  const isFetching = workflowsQuery.isFetching || activeRunsQuery.isFetching || approvalsQuery.isFetching || agentChatQuery.isFetching;
  const error = workflowsQuery.error ?? activeRunsQuery.error ?? approvalsQuery.error;
  const voiceProviders = getVoiceProviderStatus();
  const voiceInputProvider = getPreferredVoiceInputProvider();
  const voiceOutputProvider = getPreferredVoiceOutputProvider();
  const canListen = Boolean(voiceInputProvider);
  const canSpeak = Boolean(voiceOutputProvider);
  const voiceProviderLabel = voiceProviders.find((provider) => provider.id === "hermes" && (provider.canTranscribe || provider.canSpeak))?.label ??
    voiceProviders.find((provider) => provider.id === "browser" && (provider.canTranscribe || provider.canSpeak))?.label ??
    "Voice unavailable";
  const agentOptions = useMemo(() => {
    const values = [
      selectedWorkflow?.default_actor,
      selectedWorkflow?.owner_role,
      ...workflows.map((workflow) => workflow.default_actor),
      ...workflows.map((workflow) => workflow.owner_role),
      "Fiona/Hermes",
      "Steve/Claude",
      "Keel/Codex",
    ];
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
  }, [selectedWorkflow?.default_actor, selectedWorkflow?.owner_role, workflows]);
  const targetAgent = selectedAgent || agentOptions[0] || "Fiona/Hermes";

  const visibleRuns = useMemo(() => {
    const approvalIds = new Set(approvals.map((run) => run.id));
    return activeRuns.filter((run) => !approvalIds.has(run.id)).slice(0, 5);
  }, [activeRuns, approvals]);
  const routedChatEntries = useMemo(
    () => (agentChatQuery.data ?? []).filter(isChatInboxItem).map(inboxItemToChatEntry),
    [agentChatQuery.data],
  );
  const visibleChatEntries = useMemo(() => {
    const entriesById = new Map<string, AgentChatEntry>();
    for (const entry of [...chatEntries, ...routedChatEntries]) {
      entriesById.set(entry.id, entry);
    }
    return Array.from(entriesById.values())
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 4);
  }, [chatEntries, routedChatEntries]);

  useEffect(() => {
    return () => {
      dictationRef.current?.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      audioRef.current?.pause();
      if (supportsBrowserSpeechSynthesis()) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatEntries.slice(0, 8)));
    } catch {
      /* ignore */
    }
  }, [chatEntries]);

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
    if (!activeWorkflowId) return;
    await startWorkflowFromPanel({
      workflowId: activeWorkflowId,
      triggerSource: "ui",
      entityScope: selectedWorkflow?.entity ?? undefined,
      context: {
        route: typeof window === "undefined" ? null : window.location.pathname,
        source: voiceDraft.trim() ? "agent_panel_voice_intake" : "agent_panel",
        voice_provider: voiceInputProvider?.id ?? voiceOutputProvider?.id ?? null,
        voice_transcript: voiceDraft.trim() || null,
      },
    });
  }

  async function sendChatMessage() {
    const message = chatDraft.trim();
    if (!message || isSendingChat) return;

    try {
      setIsSendingChat(true);
      const result = await sendToAgentChat({
        message,
        targetAgent,
        context: {
          type: "agent_panel_chat",
          route: typeof window === "undefined" ? undefined : window.location.pathname,
          payload: {
            target_agent: targetAgent,
            selected_workflow_id: activeWorkflowId || null,
            selected_workflow_name: selectedWorkflow?.name ?? null,
            active_run_count: visibleRuns.length,
            pending_approval_count: approvals.length,
            voice_input_provider: voiceInputProvider?.id ?? null,
            voice_output_provider: voiceOutputProvider?.id ?? null,
            voice_transcript: voiceDraft.trim() || null,
            voice_providers: voiceProviders.map((provider) => ({
              id: provider.id,
              configured: provider.configured,
              can_transcribe: provider.canTranscribe,
              can_speak: provider.canSpeak,
            })),
            available_actions: [
              "send_message",
              "start_workflow",
              "request_approval",
              "resolve_approval",
              "add_receipt",
            ],
          },
        },
        submit: true,
      });
      const status: ChatEntryStatus = result.status === "submitted" ? "submitted" : "queued";
      setChatEntries((current) => [
        {
          id: result.messageId ?? result.inboxItemId ?? `chat-${Date.now()}`,
          message,
          targetAgent,
          status,
          detail: result.messageId ?? result.inboxItemId ?? status,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 8));
      setChatDraft("");
      toast.success(status === "submitted" ? "Message sent to agent" : "Message queued for agent", {
        description: result.messageId ?? result.inboxItemId,
      });
    } catch (chatError) {
      const status: ChatEntryStatus = "failed";
      setChatEntries((current) => [
        {
          id: `failed-${Date.now()}`,
          message,
          targetAgent,
          status,
          detail: chatError instanceof Error ? chatError.message : "Send failed",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 8));
      toastError("Agent chat failed", chatError);
    } finally {
      setIsSendingChat(false);
    }
  }

  function appendVoiceDraft(text: string) {
    const normalized = text.trim();
    if (!normalized) return;
    setVoiceDraft((current) => `${current.trim()}${current.trim() ? " " : ""}${normalized}`);
  }

  async function transcribeHermesRecording(audio: Blob) {
    try {
      const result = await transcribeWithHermes(audio);
      if (!result.transcript) {
        toast.error("No speech detected");
        return;
      }
      appendVoiceDraft(result.transcript);
      toast.success("Transcript added", {
        description: result.provider,
      });
    } catch (transcribeError) {
      toastError("Hermes transcription failed", transcribeError);
    }
  }

  async function startHermesVoiceDraft() {
    if (isListening) {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      setIsListening(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Audio recording unavailable");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setIsListening(false);
        toast.error("Audio recording stopped");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        setIsListening(false);
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recordedChunksRef.current = [];
        if (audio.size > 0) void transcribeHermesRecording(audio);
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch (recordError) {
      setIsListening(false);
      toastError("Microphone unavailable", recordError);
    }
  }

  function startBrowserVoiceDraft() {
    if (isListening) {
      dictationRef.current?.stop();
      setIsListening(false);
      setInterimTranscript("");
      return;
    }

    const session = startBrowserDictation({
      onFinal: appendVoiceDraft,
      onInterim: setInterimTranscript,
      onError: (message) => {
        setIsListening(false);
        setInterimTranscript("");
        toast.error("Speech recognition stopped", { description: message });
      },
      onEnd: () => {
        setIsListening(false);
        setInterimTranscript("");
      },
    });
    if (!session) {
      toast.error("Speech recognition unavailable");
      return;
    }
    dictationRef.current = session;
    setIsListening(true);
  }

  function startVoiceDraft() {
    if (voiceInputProvider?.id === "hermes") {
      void startHermesVoiceDraft();
      return;
    }
    startBrowserVoiceDraft();
  }

  function stopSpeaking() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (supportsBrowserSpeechSynthesis()) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  async function speakWithProvider(text: string, providerId: VoiceProviderId) {
    if (providerId === "hermes") {
      const result = await speakWithHermes(text);
      const audio = new Audio(result.dataUrl);
      audioRef.current = audio;
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      await audio.play();
      return;
    }

    if (!supportsBrowserSpeechSynthesis()) throw new Error("Speech output unavailable.");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function speakBrief() {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    if (!voiceOutputProvider) {
      toast.error("Speech output unavailable");
      return;
    }

    try {
      setIsSpeaking(true);
      await speakWithProvider(buildVoiceBrief(approvals, visibleRuns), voiceOutputProvider.id);
    } catch (speakError) {
      if (voiceOutputProvider.id === "hermes" && supportsBrowserSpeechSynthesis()) {
        try {
          await speakWithProvider(buildVoiceBrief(approvals, visibleRuns), "browser");
          toast.error("Hermes speech unavailable", {
            description: "Used browser speech fallback.",
          });
          return;
        } catch {
          /* report the original Hermes error */
        }
      }
      setIsSpeaking(false);
      toastError("Speech output failed", speakError);
    }
  }

  async function createTaskFromVoiceDraft() {
    const transcript = voiceDraft.trim();
    if (!transcript || isCreatingVoiceTask) return;

    try {
      setIsCreatingVoiceTask(true);
      const result = await createVoiceDraftTask({
        transcript,
        requestedBy: OPERATOR_ACTOR,
        sourceRoute: typeof window === "undefined" ? null : window.location.pathname,
        sourceProvider: voiceInputProvider?.id ?? voiceOutputProvider?.id ?? null,
        confirmWrite: true,
      });
      toast.success("Voice task created", {
        description: result.task?.title ?? result.task_id,
      });
      setVoiceDraft("");
    } catch (createError) {
      toastError("Voice task creation failed", createError);
    } finally {
      setIsCreatingVoiceTask(false);
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
            <h2 className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Chat</h2>
            <select
              value={targetAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              aria-label="Agent chat target"
              className="h-6 max-w-[158px] rounded border border-[var(--border)] bg-[var(--mantle)] px-1.5 font-ui text-[10.5px] text-[var(--subtext-0)] outline-none transition-colors focus:border-[var(--accent-border)]"
            >
              {agentOptions.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--base)] p-2.5">
            <div className="mb-2 flex items-center gap-2 text-[var(--overlay-1)]">
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-ui text-[10.5px]">
                Same agent runtime as workflows
              </span>
            </div>
            <textarea
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendChatMessage();
                }
              }}
              rows={3}
              placeholder="Message the loaded agent"
              className="min-h-[72px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 py-2 font-ui text-[12px] leading-relaxed text-[var(--text)] outline-none transition-colors placeholder:text-[var(--overlay-1)] focus:border-[var(--accent-border)]"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-ui text-[10.5px] text-[var(--overlay-1)]">
                Route, workflow, and voice state
              </span>
              <button
                type="button"
                onClick={() => void sendChatMessage()}
                disabled={!chatDraft.trim() || isSendingChat}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 font-ui text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-50"
              >
                {isSendingChat ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </button>
            </div>
            {visibleChatEntries.length > 0 ? (
              <div className="mt-2 space-y-1.5 border-t border-[var(--border-subtle)] pt-2">
                {visibleChatEntries.map((entry) => (
                  <div key={entry.id} className="rounded border border-[var(--border-subtle)] px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-ui text-[10px] font-medium text-[var(--subtext-0)]">
                        {entry.targetAgent} / {entry.status === "submitted" ? "Sent" : entry.status === "queued" ? "Queued" : "Failed"}
                      </span>
                      <span className="shrink-0 font-ui text-[10px] text-[var(--overlay-1)]">
                        {formatRunTime(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 font-ui text-[11px] leading-snug text-[var(--text)]">{entry.message}</p>
                    {entry.reply ? (
                      <p className="mt-1.5 border-l-2 border-[var(--accent-border)] pl-2 font-ui text-[11px] leading-snug text-[var(--subtext-0)]">
                        {entry.reply}
                      </p>
                    ) : null}
                    {entry.widget ? <AgentChatWidget widget={entry.widget} /> : null}
                    <p className="mt-1 truncate font-mono text-[9.5px] text-[var(--overlay-1)]">{entry.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

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
              <span className="mr-1 max-w-[92px] truncate rounded-full border border-[var(--border)] px-1.5 py-0.5 font-ui text-[10px] text-[var(--subtext-0)]">
                {voiceProviderLabel}
              </span>
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
          {interimTranscript ? (
            <p className="font-ui text-[11px] italic leading-snug text-[var(--overlay-1)]" aria-live="polite">
              {interimTranscript}…
            </p>
          ) : null}
          {voiceDraft.trim() ? (
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={createTaskFromVoiceDraft}
                disabled={isCreatingVoiceTask}
                className="inline-flex h-6 items-center justify-center gap-1 rounded border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 font-ui text-[10.5px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-50"
              >
                {isCreatingVoiceTask ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Create task
              </button>
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
          <h2 className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Operations</h2>
          <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--base)]">
            <CountRow
              label="Approvals"
              count={approvals.length}
              to={APPROVAL_QUEUE_URL}
              tone={approvals.length > 0 ? "caution" : "neutral"}
            />
            <div className="border-t border-[var(--border-subtle)]" />
            <CountRow
              label="Active runs"
              count={visibleRuns.length}
              to={RUN_BOARD_URL}
              tone="neutral"
              loading={isFetching}
            />
          </div>
        </section>
      </div>
    </aside>
  );
}

function CountRow({
  label,
  count,
  to,
  tone,
  loading = false,
}: {
  label: string;
  count: number;
  to: string;
  tone: "caution" | "neutral";
  loading?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-[var(--surface-wash)]"
    >
      <span className="font-ui text-[12px] font-medium text-[var(--text)]">{label}</span>
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 font-mono text-[10px]",
            tone === "caution" && count > 0
              ? "border-[color-mix(in_srgb,var(--caution)_42%,transparent)] text-[var(--caution)]"
              : "border-[var(--border)] text-[var(--subtext-0)]",
          )}
        >
          {loading ? "…" : count}
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
      </span>
    </Link>
  );
}
