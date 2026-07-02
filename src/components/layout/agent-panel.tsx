import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, PanelRightClose, PanelRightOpen, Play, Plus, RefreshCw, Send, Square, Volume2 } from "lucide-react";

import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { MarkdownBody } from "@/components/ui/markdown-body";
import {
  extractGenuiBlocks,
  GENUI_SYSTEM_PROMPT,
  parseAgentChatResult,
  stripGenuiForStreaming,
  type AgentChatWidget as AgentChatWidgetModel,
} from "@/lib/agent-widgets";

import {
  createVoiceDraftTask,
  listFionaInboxItems,
  listWorkflowRuns,
  listWorkflows,
  OPERATOR_ACTOR,
} from "@/lib/data";
import type { FionaInboxItem, WorkflowRunItem } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import { useWindowSize } from "@/lib/use-window-size";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { checkHermesApi, DEFAULT_HERMES_PROFILE, fetchHermesProfiles, sendToAgentChat, streamHermesChat } from "@/services/agent";
// Run/approval surfaces live in Databases-native views; the panel is chat only.
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
const HERMES_SESSION_KEY = "intelizen:hermes-session-id";
const SPEAK_REPLIES_KEY = "intelizen:agent-panel-speak-replies";
const CHAT_CLEARED_KEY = "intelizen:chat-cleared-at";
const PANEL_WIDTH_KEY = "intelizen:agent-panel-width";
const PANEL_MIN_WIDTH = 300;
const PANEL_MAX_WIDTH = 560;
type ChatEntryStatus = "submitted" | "queued" | "failed";

interface AgentChatEntry {
  id: string;
  message: string;
  targetAgent: string;
  status: ChatEntryStatus;
  detail: string;
  createdAt: string;
  /** When the agent's reply landed (inbox row updated_at). */
  repliedAt?: string | null;
  /** Agent reply text parsed from the completed inbox result. */
  reply?: string | null;
  /** In-chat GenUI widget (agent-native data-widget contract). */
  widget?: AgentChatWidgetModel | null;
}

/** One rendered message in the thread: a user turn or an agent turn. */
interface ChatTurn {
  id: string;
  role: "user" | "agent";
  speaker: string;
  text: string | null;
  widget?: AgentChatWidgetModel | null;
  status?: ChatEntryStatus;
  detail?: string;
  ts: string;
}

const TIME_DIVIDER_GAP_MS = 15 * 60_000;

/** Flatten request/response rows into a chronological message stream. */
function entriesToTurns(entries: AgentChatEntry[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const entry of entries) {
    turns.push({
      id: `${entry.id}-user`,
      role: "user",
      speaker: "You",
      text: entry.message,
      status: entry.status,
      detail: entry.detail,
      ts: entry.createdAt,
    });
    if (entry.reply || entry.widget) {
      turns.push({
        id: `${entry.id}-agent`,
        role: "agent",
        speaker: entry.targetAgent,
        text: entry.reply ?? null,
        widget: entry.widget,
        ts: entry.repliedAt ?? entry.createdAt,
      });
    }
  }
  return turns
    .sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime())
    .slice(-40);
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
    createdAt: item.created_at,
    repliedAt: item.updated_at ?? null,
    reply,
    widget,
  };
}

export function AgentPanel() {
  const [collapsed, setCollapsed] = useState(() => readCollapsed());
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCreatingVoiceTask, setIsCreatingVoiceTask] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(() => {
    try { return window.localStorage.getItem(SPEAK_REPLIES_KEY) === "1"; } catch { return false; }
  });
  const [clearedAt, setClearedAt] = useState<string | null>(() => {
    try { return window.localStorage.getItem(CHAT_CLEARED_KEY); } catch { return null; }
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
      return Number.isFinite(stored) && stored >= PANEL_MIN_WIDTH ? Math.min(stored, PANEL_MAX_WIDTH) : 336;
    } catch { return 336; }
  });
  const abortRef = useRef<AbortController | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [chatEntries, setChatEntries] = useState<AgentChatEntry[]>(() => readChatHistory());
  const dictationRef = useRef<BrowserDictationSession | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const hermesPreviewBusyRef = useRef(false);
  const hermesPreviewDirtyRef = useRef(false);
  /** Draft text present when dictation started; live transcript appends after it. */
  const dictationBaseDraftRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
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
  const queryClient = useQueryClient();
  // Direct Hermes connection: the API server health check is the source of
  // truth (it has CORS for the app origin); the dashboard adds the catalog.
  const apiQuery = useQuery({
    queryKey: ["hermes-api-health"],
    queryFn: checkHermesApi,
    refetchInterval: expanded ? 60_000 : false,
    staleTime: 30_000,
    enabled: expanded,
  });
  const profilesQuery = useQuery({
    queryKey: ["hermes-profiles"],
    queryFn: fetchHermesProfiles,
    staleTime: 60_000,
    retry: 1,
    enabled: expanded,
  });
  const agentChatQuery = useQuery({
    queryKey: ["agent-panel", "chat-receipts"],
    queryFn: () => listFionaInboxItems({ limit: 15 }),
    // Realtime pushes updates; polling is only a safety net, tightened while
    // a message is awaiting its reply.
    refetchInterval: expanded ? 60_000 : false,
    staleTime: 5_000,
    enabled: expanded,
  });
  const { isStartingWorkflow, start: startWorkflowFromPanel } = useStartWorkflow({
    onStarted: () => refresh(),
  });

  // Near-instant replies: subscribe to inbox inserts/updates and refetch the
  // thread the moment the agent writes.
  useEffect(() => {
    if (!expanded) return;
    const channel = supabase
      .channel("agent-panel-chat")
      .on(
        "postgres_changes",
        { event: "*", schema: "comms", table: "fiona_inbox" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["agent-panel", "chat-receipts"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [expanded, queryClient]);

  const activeRuns = activeRunsQuery.data ?? [];
  const approvals = approvalsQuery.data ?? [];
  const workflows = workflowsQuery.data ?? [];
  const isFetching = workflowsQuery.isFetching || activeRunsQuery.isFetching || approvalsQuery.isFetching || agentChatQuery.isFetching;
  const error = workflowsQuery.error ?? activeRunsQuery.error ?? approvalsQuery.error;
  const voiceProviders = getVoiceProviderStatus();
  const voiceInputProvider = getPreferredVoiceInputProvider();
  const voiceOutputProvider = getPreferredVoiceOutputProvider();
  const canListen = Boolean(voiceInputProvider);
  const canSpeak = Boolean(voiceOutputProvider);
  const hermesApiLive = apiQuery.data === true;
  const hermesConnected = hermesApiLive;
  // Profile catalog from the dashboard when it's up; otherwise the running
  // gateway's own profile. Static actors are the fully-offline fallback
  // (messages then queue via the durable inbox).
  const hermesProfiles = useMemo(() => {
    if (profilesQuery.isSuccess && (profilesQuery.data?.length ?? 0) > 0) return profilesQuery.data ?? [];
    if (hermesConnected) {
      return [{
        name: DEFAULT_HERMES_PROFILE,
        isDefault: true,
        model: null,
        provider: null,
        gatewayRunning: true,
        description: "Running gateway profile",
      }];
    }
    return [];
  }, [profilesQuery.isSuccess, profilesQuery.data, hermesConnected]);
  const agentOptions = useMemo(() => {
    if (hermesProfiles.length > 0) return hermesProfiles.map((profile) => profile.name);
    return ["Fiona/Hermes", "Steve/Claude", "Keel/Codex"];
  }, [hermesProfiles]);
  const defaultAgent = hermesProfiles.find((profile) => profile.isDefault)?.name ?? hermesProfiles[0]?.name ?? "Fiona/Hermes";
  const targetAgent = selectedAgent && agentOptions.includes(selectedAgent) ? selectedAgent : defaultAgent;
  const targetProfile = hermesConnected ? hermesProfiles.find((profile) => profile.name === targetAgent) ?? null : null;

  const visibleRuns = useMemo(() => {
    const approvalIds = new Set(approvals.map((run) => run.id));
    return activeRuns.filter((run) => !approvalIds.has(run.id)).slice(0, 5);
  }, [activeRuns, approvals]);
  const routedChatEntries = useMemo(
    () =>
      (agentChatQuery.data ?? [])
        .filter(isChatInboxItem)
        .map(inboxItemToChatEntry)
        .filter((entry) => !clearedAt || entry.createdAt > clearedAt),
    [agentChatQuery.data, clearedAt],
  );
  // Thread: request/response rows flattened into chronological message turns.
  // Server rows win over local optimistic entries carrying the same message
  // (direct dispatches get their durable row when the agent writes back).
  const chatTurns = useMemo(() => {
    const routedMessages = new Set(routedChatEntries.map((entry) => entry.message.trim()));
    const entriesById = new Map<string, AgentChatEntry>();
    for (const entry of chatEntries) {
      if (routedMessages.has(entry.message.trim())) continue;
      entriesById.set(entry.id, entry);
    }
    for (const entry of routedChatEntries) {
      entriesById.set(entry.id, entry);
    }
    return entriesToTurns(Array.from(entriesById.values()));
  }, [chatEntries, routedChatEntries]);
  const awaitingReply = chatTurns.some((turn) => turn.role === "user" && turn.status === "queued");

  // Tighten the poll safety net while a reply is outstanding.
  useEffect(() => {
    if (!expanded || !awaitingReply) return;
    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["agent-panel", "chat-receipts"] });
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [expanded, awaitingReply, queryClient]);

  // Keep the thread pinned to the newest message.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [chatTurns.length, isSendingChat, streamingReply]);

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

  async function handleStartWorkflow(workflowId: string) {
    const workflow = workflows.find((candidate) => candidate.workflow_id === workflowId);
    if (!workflow) return;
    setPlusMenuOpen(false);
    await startWorkflowFromPanel({
      workflowId,
      triggerSource: "ui",
      entityScope: workflow.entity ?? undefined,
      context: {
        route: typeof window === "undefined" ? null : window.location.pathname,
        source: "agent_panel",
        composer_note: chatDraft.trim() || null,
      },
    });
  }

  async function sendChatMessage() {
    const message = chatDraft.trim();
    if (!message || isSendingChat) return;

    // Streaming path: direct conversation over the Hermes API server.
    if (hermesApiLive) {
      const entryId = `api-${Date.now()}`;
      const sentAt = new Date().toISOString();
      setChatDraft("");
      setIsSendingChat(true);
      setStreamingReply("");
      setChatEntries((current) => [
        { id: entryId, message, targetAgent, status: "submitted" as ChatEntryStatus, detail: "hermes api", createdAt: sentAt },
        ...current,
      ].slice(0, 8));
      let accumulated = "";
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        // Stateless continuity: replay the visible thread as history
        // (custom session headers are CORS-blocked by Hermes today).
        const history = chatTurns
          .filter((turn) => Boolean(turn.text))
          .slice(-12)
          .map((turn) => ({
            role: turn.role === "user" ? ("user" as const) : ("assistant" as const),
            content: turn.text ?? "",
          }));
        const result = await streamHermesChat({
          message,
          history,
          systemPrompt: GENUI_SYSTEM_PROMPT,
          signal: controller.signal,
          onDelta: (delta) => {
            accumulated += delta;
            setStreamingReply((current) => (current ?? "") + delta);
          },
        });
        const { text: cleanReply, widgets } = extractGenuiBlocks(result.text);
        setChatEntries((current) =>
          current.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  reply: cleanReply || null,
                  widget: widgets[0] ?? null,
                  repliedAt: new Date().toISOString(),
                }
              : entry,
          ),
        );
        if (speakReplies && cleanReply && voiceOutputProvider) {
          setIsSpeaking(true);
          void speakWithProvider(cleanReply, voiceOutputProvider.id).catch(() => setIsSpeaking(false));
        }
      } catch (streamError) {
        const stopped = streamError instanceof DOMException && streamError.name === "AbortError";
        setChatEntries((current) =>
          current.map((entry) =>
            entry.id === entryId
              ? stopped
                ? { ...entry, reply: accumulated || null, repliedAt: new Date().toISOString(), detail: "stopped" }
                : { ...entry, status: "failed" as ChatEntryStatus, detail: streamError instanceof Error ? streamError.message : "Stream failed" }
              : entry,
          ),
        );
        if (!stopped) toastError("Hermes chat failed", streamError);
      } finally {
        abortRef.current = null;
        setStreamingReply(null);
        setIsSendingChat(false);
      }
      return;
    }

    try {
      setIsSendingChat(true);
      const result = await sendToAgentChat({
        message,
        targetAgent,
        profile: targetProfile?.name ?? null,
        context: {
          type: "agent_panel_chat",
          route: typeof window === "undefined" ? undefined : window.location.pathname,
          payload: {
            target_agent: targetAgent,
            active_run_count: visibleRuns.length,
            pending_approval_count: approvals.length,
            voice_input_provider: voiceInputProvider?.id ?? null,
            voice_output_provider: voiceOutputProvider?.id ?? null,
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

  // Dictation types into the composer, exactly like typing.
  function appendVoiceDraft(text: string) {
    const normalized = text.trim();
    if (!normalized) return;
    setChatDraft((current) => `${current.trim()}${current.trim() ? " " : ""}${normalized}`);
  }

  function joinDraft(base: string, addition: string) {
    return `${base}${base && addition ? " " : ""}${addition.trim()}`;
  }

  async function transcribeHermesRecording(audio: Blob) {
    const base = dictationBaseDraftRef.current;
    try {
      const result = await transcribeWithHermes(audio);
      if (!result.transcript) {
        setChatDraft(base);
        toast.error("No speech detected");
        return;
      }
      setChatDraft(joinDraft(base, result.transcript));
    } catch (transcribeError) {
      setChatDraft(base);
      toastError("Hermes transcription failed", transcribeError);
    }
  }

  // Live dictation into the composer: every recorder timeslice, transcribe
  // the audio-so-far (chunks concatenated from the start form a valid file)
  // and write it straight into the draft after whatever was already typed.
  // Self-throttles — while one preview request is in flight new chunks only
  // mark it dirty. The final on-stop pass is authoritative and replaces the
  // preview text.
  async function previewHermesTranscript(mimeType: string) {
    if (hermesPreviewBusyRef.current) {
      hermesPreviewDirtyRef.current = true;
      return;
    }
    hermesPreviewBusyRef.current = true;
    try {
      do {
        hermesPreviewDirtyRef.current = false;
        const audio = new Blob(recordedChunksRef.current, { type: mimeType });
        if (audio.size === 0) return;
        const result = await transcribeWithHermes(audio).catch(() => null);
        if (recorderRef.current?.state !== "recording") return;
        if (result?.transcript) setChatDraft(joinDraft(dictationBaseDraftRef.current, result.transcript));
      } while (hermesPreviewDirtyRef.current && recorderRef.current?.state === "recording");
    } finally {
      hermesPreviewBusyRef.current = false;
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
      dictationBaseDraftRef.current = chatDraft.trim();
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          if (recorder.state === "recording") {
            void previewHermesTranscript(recorder.mimeType || "audio/webm");
          }
        }
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
        // The live preview stays in the draft while the authoritative
        // final pass runs; transcribeHermesRecording replaces it.
        if (audio.size > 0) void transcribeHermesRecording(audio);
      };
      recorderRef.current = recorder;
      recorder.start(2000);
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

  function startNewSession() {
    const now = new Date().toISOString();
    try {
      window.localStorage.removeItem(HERMES_SESSION_KEY);
      window.localStorage.setItem(CHAT_CLEARED_KEY, now);
      window.localStorage.removeItem(CHAT_HISTORY_KEY);
    } catch { /* ignore */ }
    setClearedAt(now);
    setChatEntries([]);
    setPlusMenuOpen(false);
    toast.success("New chat session started");
  }

  function toggleSpeakReplies() {
    setSpeakReplies((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SPEAK_REPLIES_KEY, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
    setPlusMenuOpen(false);
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

  async function createTaskFromComposer() {
    const transcript = chatDraft.trim();
    if (!transcript || isCreatingVoiceTask) return;

    try {
      setIsCreatingVoiceTask(true);
      setPlusMenuOpen(false);
      const result = await createVoiceDraftTask({
        transcript,
        requestedBy: OPERATOR_ACTOR,
        sourceRoute: typeof window === "undefined" ? null : window.location.pathname,
        sourceProvider: voiceInputProvider?.id ?? voiceOutputProvider?.id ?? null,
        confirmWrite: true,
      });
      toast.success("Task created from message", {
        description: result.task?.title ?? result.task_id,
      });
      setChatDraft("");
    } catch (createError) {
      toastError("Task creation failed", createError);
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        {approvals.length > 0 ? (
          <span className="mt-4 rounded-full border border-[color-mix(in_srgb,var(--caution)_42%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--caution)]">
            {approvals.length}
          </span>
        ) : null}
      </aside>
    );
  }

  // Chat-first surface: full-height thread, slim ops strip, and a single
  // composer frame at the bottom carrying all controls (agent-native anatomy).
  function startPanelResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const onMove = (move: PointerEvent) => {
      const next = Math.min(Math.max(window.innerWidth - move.clientX, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH);
      setPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setPanelWidth((current) => {
        try {
          window.localStorage.setItem(PANEL_WIDTH_KEY, String(current));
        } catch { /* ignore */ }
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <aside
      className="relative flex h-dvh shrink-0 flex-col border-l border-[var(--border)] bg-[var(--mantle)]"
      style={{ width: panelWidth }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent panel"
        onPointerDown={startPanelResize}
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-[var(--accent-border)]"
      />
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <p className="truncate font-ui text-[13px] font-semibold text-[var(--text)]">Agent Panel</p>
            <p className="flex items-center gap-1.5 truncate font-ui text-[11px] text-[var(--overlay-1)]">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  hermesConnected ? "bg-[var(--success)]" : "bg-[var(--overlay-0)]",
                )}
              />
              {hermesConnected
                ? `Hermes · ${targetProfile?.model ?? targetAgent}`
                : "Hermes offline · queuing via inbox"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh agent panel"
            title="Refresh"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse agent panel"
            title="Collapse agent panel"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error ? (
          <div className="mb-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3">
            <p className="font-ui text-[12px] font-medium text-[var(--danger)]">Agent state unavailable</p>
            <p className="mt-1 line-clamp-3 font-ui text-[11px] text-[var(--subtext-0)]">
              {error instanceof Error ? error.message : "Refresh failed."}
            </p>
          </div>
        ) : null}

        {chatTurns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="font-ui text-[12px] text-[var(--subtext-0)]">Message an agent to get started.</p>
            <p className="font-ui text-[11px] leading-relaxed text-[var(--overlay-1)]">
              Route context travels with every message. Use + for workflows and actions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {chatTurns.map((turn, index) => {
              const previous = chatTurns[index - 1];
              const gapMs = previous ? new Date(turn.ts).getTime() - new Date(previous.ts).getTime() : Infinity;
              const showDivider = gapMs > TIME_DIVIDER_GAP_MS;
              const speakerChanged = !previous || previous.speaker !== turn.speaker || showDivider;
              return (
                <div key={turn.id}>
                  {showDivider ? (
                    <p className="py-1.5 text-center font-mono text-[9.5px] text-[var(--overlay-1)]">{formatRunTime(turn.ts)}</p>
                  ) : null}
                  {/* VS Code-style turns: full-width blocks, speaker label, no bubbles. */}
                  {turn.role === "user" ? (
                    <div className="rounded-md bg-[var(--surface-wash)] px-2.5 py-2">
                      {speakerChanged ? (
                        <span className="mb-0.5 block font-ui text-[10px] font-semibold text-[var(--subtext-0)]">You</span>
                      ) : null}
                      <p className="whitespace-pre-wrap font-ui text-[12.5px] leading-relaxed text-[var(--text)]">{turn.text}</p>
                      {turn.status === "queued" ? (
                        <p className="mt-1 font-ui text-[10px] italic text-[var(--overlay-1)]">Waiting for agent…</p>
                      ) : turn.status === "failed" ? (
                        <p className="mt-1 font-ui text-[10px] text-[var(--danger)]">Failed — {turn.detail}</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-2.5">
                      {speakerChanged ? (
                        <span className="mb-0.5 block font-ui text-[10px] font-semibold text-[var(--accent)]">{turn.speaker}</span>
                      ) : null}
                      {turn.text ? (
                        <MarkdownBody content={turn.text} className="agent-chat-markdown" />
                      ) : null}
                      {turn.widget ? <AgentChatWidget widget={turn.widget} pinnable /> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {streamingReply !== null ? (
          <div className="mt-3 px-2.5">
            <span className="mb-0.5 block font-ui text-[10px] font-semibold text-[var(--accent)]">{targetAgent}</span>
            {stripGenuiForStreaming(streamingReply) ? (
              <MarkdownBody content={stripGenuiForStreaming(streamingReply)} className="agent-chat-markdown" />
            ) : streamingReply ? (
              <p className="font-ui text-[12px] italic text-[var(--overlay-1)]">Rendering…</p>
            ) : (
              <p className="font-ui text-[12px] italic text-[var(--overlay-1)]">Thinking…</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="relative rounded-lg bg-[var(--base)]">
          {plusMenuOpen ? (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setPlusMenuOpen(false)}
              />
              <div className="absolute bottom-full left-0 z-40 mb-2 max-h-72 w-[280px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--mantle)] py-1 shadow-[var(--shadow-elevated)]">
                <p className="px-3 py-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Run workflow
                </p>
                {workflows.length === 0 ? (
                  <p className="px-3 py-1.5 font-ui text-[11px] text-[var(--overlay-1)]">No active workflows.</p>
                ) : (
                  workflows.map((workflow) => (
                    <button
                      key={workflow.workflow_id}
                      type="button"
                      disabled={isStartingWorkflow}
                      onClick={() => void handleStartWorkflow(workflow.workflow_id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                    >
                      <Play className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                      <span className="truncate">{workflow.name}</span>
                    </button>
                  ))
                )}
                <div className="my-1 border-t border-[var(--border-subtle)]" />
                <p className="px-3 py-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Actions
                </p>
                <button
                  type="button"
                  disabled={!chatDraft.trim() || isCreatingVoiceTask}
                  onClick={() => void createTaskFromComposer()}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Plus className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  {isCreatingVoiceTask ? "Creating task…" : "Create task from message"}
                </button>
                <button
                  type="button"
                  disabled={!canSpeak}
                  onClick={() => {
                    setPlusMenuOpen(false);
                    void speakBrief();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Volume2 className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  Speak status brief
                </button>
                <button
                  type="button"
                  onClick={toggleSpeakReplies}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Volume2 className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  {speakReplies ? "Speak replies: on" : "Speak replies: off"}
                </button>
                <button
                  type="button"
                  onClick={startNewSession}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <RefreshCw className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  New chat session
                </button>
              </div>
            </>
          ) : null}

          <textarea
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendChatMessage();
              }
            }}
            rows={3}
            placeholder={`Message ${targetAgent}…`}
            className="max-h-40 min-h-[64px] w-full resize-none bg-transparent px-3 pt-2.5 font-ui text-[12.5px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
          />
          {interimTranscript ? (
            <p className="px-3 font-ui text-[11px] italic leading-snug text-[var(--overlay-1)]" aria-live="polite">
              {interimTranscript}…
            </p>
          ) : null}

          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            <button
              type="button"
              onClick={() => setPlusMenuOpen((open) => !open)}
              aria-label="Workflows and actions"
              title="Workflows and actions"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
                plusMenuOpen
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
              )}
            >
              {isStartingWorkflow ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
            <select
              value={targetAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              aria-label="Agent"
              className="h-7 max-w-[132px] rounded-md border border-transparent bg-transparent px-1 font-ui text-[11px] text-[var(--subtext-0)] outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--accent-border)]"
            >
              {agentOptions.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
            <span className="flex-1" />
            <button
              type="button"
              onClick={startVoiceDraft}
              disabled={!canListen}
              aria-label={isListening ? "Stop dictation" : "Dictate"}
              title={isListening ? "Stop dictation" : "Dictate"}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
                isListening
                  ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
                  : "text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
              )}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            {isSpeaking ? (
              <button
                type="button"
                onClick={stopSpeaking}
                aria-label="Stop speaking"
                title="Stop speaking"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)] transition-colors"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : null}
            {isSendingChat && streamingReply !== null ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop response"
                title="Stop response"
                className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void sendChatMessage()}
                disabled={!chatDraft.trim() || isSendingChat}
                aria-label="Send message"
                title="Send (Enter)"
                className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
              >
                {isSendingChat ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

