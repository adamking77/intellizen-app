import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { ArrowDown, Copy, Headphones, LoaderCircle, Mic, MicOff, PanelRightClose, PanelRightOpen, Paperclip, Pencil, PictureInPicture2, Play, Plus, RefreshCw, RotateCcw, Search, Send, Square, Volume2, X } from "lucide-react";

import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { AgentActionEvent } from "@/components/agent/agent-action-event";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MarkdownBody } from "@/components/ui/markdown-body";
import {
  extractGenuiBlocks,
  GENUI_SYSTEM_PROMPT,
  parseAgentChatResult,
  stripGenuiForStreaming,
  type AgentChatWidget as AgentChatWidgetModel,
} from "@/lib/agent-widgets";
import { WORKSPACE_REMOTE_WRITE_EVENT } from "@/lib/workspace-events";
import { selectActiveHermesProfile } from "@/lib/hermes-profiles";
import {
  buildSteeredAgentPanelHistory,
  countUnreadAgentPanelReplies,
  filterAgentPanelChatReceipts,
  latestAgentPanelReplyAt,
} from "@/lib/agent-panel-chat";
import {
  formatChatTextAttachment,
  MAX_CHAT_TEXT_FILE_BYTES,
  MAX_CHAT_TEXT_FILES,
  supportsChatTextFile,
} from "@/lib/chat-attachments";
import {
  INITIAL_LIVE_VOICE_STATE,
  liveVoicePhaseLabel,
  liveVoiceReducer,
} from "@/lib/live-voice-session";

import {
  createVoiceDraftTask,
  GENZEN_WORKSPACE_DATABASE_IDS,
  listFionaInboxItems,
  listWorkflows,
  OPERATOR_ACTOR,
} from "@/lib/data";
import type { FionaInboxItem } from "@/lib/types";
import { toast, toastError } from "@/lib/toast";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import { PaneResizeEdges } from "@/components/layout/window-chrome";
import { useWindowSize } from "@/lib/use-window-size";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  conversationContextFromChatPayload,
  readConversationContext,
  subscribeConversationContext,
  type ConversationContextSnapshot,
} from "@/lib/conversation-context";
import { checkHermesApi, DEFAULT_HERMES_PROFILE, fetchHermesProfiles, sendToAgentChat, streamHermesChat } from "@/services/agent";
import { normalizeLocalActionEvent, type ConversationActionEvent } from "@/lib/agent-conversation";
// Operational evidence may appear inline; canonical monitoring and decisions stay in Databases.
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
const CHAT_DRAFT_KEY = "intelizen:agent-panel-chat-draft";
const HERMES_SESSION_KEY = "intelizen:hermes-session-id";
const SPEAK_REPLIES_KEY = "intelizen:agent-panel-speak-replies";
const CHAT_CLEARED_KEY = "intelizen:chat-cleared-at";
const CHAT_LAST_READ_KEY = "intelizen:agent-panel-last-read-at";
const PANEL_WIDTH_KEY = "intelizen:agent-panel-width";
const PANEL_MIN_WIDTH = 300;
const PANEL_MAX_WIDTH = 560;
const LOCAL_CHAT_HISTORY_LIMIT = 40;
type ChatEntryStatus = "submitted" | "queued" | "failed" | "cancelled";
interface SendChatOptions {
  historyOverride?: Array<{ role: "user" | "assistant"; content: string }>;
  preserveDraft?: boolean;
  steering?: boolean;
  liveVoice?: boolean;
}

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
  widgets?: AgentChatWidgetModel[];
  /** Exact bounded app context included with this message. */
  context?: ConversationContextSnapshot | null;
}

/** One rendered message in the thread: a user turn or an agent turn. */
interface ChatTurn {
  id: string;
  role: "user" | "agent";
  speaker: string;
  text: string | null;
  widgets?: AgentChatWidgetModel[];
  status?: ChatEntryStatus;
  detail?: string;
  context?: ConversationContextSnapshot | null;
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
      context: entry.context ?? null,
      ts: entry.createdAt,
    });
    const widgets = entry.widgets ?? (entry.widget ? [entry.widget] : []);
    if (entry.reply || widgets.length > 0 || entry.status === "cancelled") {
      turns.push({
        id: `${entry.id}-agent`,
        role: "agent",
        speaker: entry.targetAgent,
        text: entry.reply ?? null,
        widgets,
        status: entry.status === "cancelled" ? "cancelled" : undefined,
        detail: entry.status === "cancelled" ? entry.detail : undefined,
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

function readCollapsed(): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null; // no explicit choice — follow the cramped auto-collapse
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
      .slice(0, LOCAL_CHAT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function readStoredValue(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function appendToDraft(current: string, addition: string) {
  const trimmed = addition.trim();
  if (!trimmed) return current;
  return `${current.trim()}${current.trim() ? "\n\n" : ""}${trimmed}`;
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

function canonicalAgentName(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "default") return "fiona";
  if (normalized.includes("fiona")) return "fiona";
  if (normalized.includes("steve") || normalized.includes("claude")) return "steve";
  if (normalized.includes("keel") || normalized.includes("codex")) return "keel";
  return normalized || "fiona";
}

function agentDisplayName(value: string) {
  const canonical = canonicalAgentName(value);
  return canonical.charAt(0).toUpperCase() + canonical.slice(1);
}

function contextRouteLabel(context: ConversationContextSnapshot | null | undefined) {
  if (!context) return null;
  return `${context.route.pathname}${context.route.search}${context.route.hash}`;
}

function contextPromptBlock(context: ConversationContextSnapshot | null) {
  if (!context) return "";
  return `\n\nIntelliZen visible context (bounded; do not infer broader access):\n${JSON.stringify({
    version: context.version,
    route: context.route,
    references: context.selections,
  }, null, 2)}`;
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
      : item.task.replace(/^Direct chat message for\s+/, "").split(":")[0]?.trim() || "fiona";
  const status: ChatEntryStatus =
    item.status === "blocked" ? "failed" : item.status === "pending" || item.status === "in_progress" ? "queued" : "submitted";
  const { reply, widgets, widget } = item.status === "complete"
    ? parseAgentChatResult(item.result)
    : { reply: null, widgets: [], widget: null };
  return {
    id: item.id,
    message,
    targetAgent: canonicalAgentName(targetAgent),
    status,
    detail: item.status,
    createdAt: item.created_at,
    repliedAt: item.updated_at ?? null,
    reply,
    widget,
    widgets,
    context: conversationContextFromChatPayload(context),
  };
}

interface AgentPanelProps {
  mode?: "docked" | "standalone";
  onEject?: () => void;
}

export function AgentPanel({ mode = "docked", onEject }: AgentPanelProps) {
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() => readCollapsed());
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCreatingVoiceTask, setIsCreatingVoiceTask] = useState(false);
  const [liveVoice, dispatchLiveVoice] = useReducer(liveVoiceReducer, INITIAL_LIVE_VOICE_STATE);
  const [chatDraft, setChatDraft] = useState(() => readStoredValue(CHAT_DRAFT_KEY));
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [lastReadAt, setLastReadAt] = useState(() => readStoredValue(CHAT_LAST_READ_KEY, new Date().toISOString()));
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
  const pendingSteerRef = useRef<string | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [confirmNewSessionOpen, setConfirmNewSessionOpen] = useState(false);
  const [chatEntries, setChatEntries] = useState<AgentChatEntry[]>(() => readChatHistory());
  const [inlineActions, setInlineActions] = useState<ConversationActionEvent[]>([]);
  const [conversationContext, setConversationContext] = useState<ConversationContextSnapshot | null>(() => readConversationContext());
  const dictationRef = useRef<BrowserDictationSession | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const hermesPreviewBusyRef = useRef(false);
  const hermesPreviewDirtyRef = useRef(false);
  const hermesPreviewErrorShownRef = useRef(false);
  /** Draft text present when dictation started; live transcript appends after it. */
  const dictationBaseDraftRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechGenerationRef = useRef(0);
  const speechCompletionRef = useRef<(() => void) | null>(null);
  const liveVoiceDictationRef = useRef<BrowserDictationSession | null>(null);
  const liveVoiceRecorderRef = useRef<MediaRecorder | null>(null);
  const liveVoiceStreamRef = useRef<MediaStream | null>(null);
  const liveVoiceTranscriptRef = useRef("");
  const liveVoiceInterimRef = useRef("");
  const liveVoiceSubmitPendingRef = useRef(false);
  const liveVoiceShouldListenRef = useRef(false);
  const liveVoiceEpochRef = useRef(0);
  const liveVoiceStateRef = useRef(liveVoice);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftStorageErrorShownRef = useRef(false);
  const historyStorageErrorShownRef = useRef(false);
  const followLatestRef = useRef(true);
  const [showReturnToLatest, setShowReturnToLatest] = useState(false);
  const { isCramped } = useWindowSize();
  const standalone = mode === "standalone";
  // Explicit user choice wins; otherwise auto-collapse when cramped.
  const collapsed = userCollapsed ?? isCramped;
  const expanded = standalone || !collapsed;

  const workflowsQuery = useQuery({
    queryKey: ["workflows", "agent-panel", "active", entityFilter],
    queryFn: () => listWorkflows({ entity: entityFilter, includeInactive: false, limit: 24 }),
    staleTime: 60_000,
    enabled: expanded,
  });
  const queryClient = useQueryClient();

  const notifyWorkspaceMayHaveChanged = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["home-pins"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] });
    // Tauri events cross the docked/detached WebviewWindow boundary. This lets
    // Fiona's ejected panel refresh Home in the main window after MCP writes.
    void emit(WORKSPACE_REMOTE_WRITE_EVENT).catch(() => {});
  }, [queryClient]);
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
    refetchInterval: expanded ? 60_000 : false,
    refetchOnWindowFocus: "always",
    networkMode: "always",
    retry: 1,
    enabled: expanded,
  });
  const agentChatQuery = useQuery({
    queryKey: ["agent-panel", "chat-receipts"],
    queryFn: () => listFionaInboxItems({ limit: 100 }),
    // Realtime pushes updates; polling is only a safety net, tightened while
    // a message is awaiting its reply.
    refetchInterval: 60_000,
    staleTime: 5_000,
    enabled: true,
  });
  const { isStartingWorkflow, start: startWorkflowFromPanel } = useStartWorkflow({
    onStarted: () => refresh(),
  });

  // Near-instant replies: subscribe to inbox inserts/updates and refetch the
  // thread the moment the agent writes.
  useEffect(() => {
    const channel = supabase
      .channel("agent-panel-chat")
      .on(
        "postgres_changes",
        { event: "*", schema: "comms", table: "fiona_inbox" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["agent-panel", "chat-receipts"] });
          notifyWorkspaceMayHaveChanged();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [notifyWorkspaceMayHaveChanged, queryClient]);

  const workflows = workflowsQuery.data ?? [];
  const isFetching = workflowsQuery.isFetching || agentChatQuery.isFetching || apiQuery.isFetching || profilesQuery.isFetching;
  const error = workflowsQuery.error ?? agentChatQuery.error;
  const voiceProviders = getVoiceProviderStatus();
  const voiceInputProvider = getPreferredVoiceInputProvider();
  const voiceOutputProvider = getPreferredVoiceOutputProvider();
  const canListen = Boolean(voiceInputProvider);
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
  const liveHermesProfile = selectActiveHermesProfile(hermesProfiles);
  // Fiona is the only counterpart in IntelliZen. The local chat endpoint is
  // gateway-scoped, so use direct streaming only when that gateway is truly
  // serving Fiona; otherwise route durably through her inbox instead of
  // presenting another profile as Fiona.
  const targetAgent = "fiona";
  const fionaDirectLive = hermesApiLive && canonicalAgentName(liveHermesProfile?.name ?? "") === targetAgent;
  const targetProfile = fionaDirectLive ? liveHermesProfile : null;
  const liveVoiceUnavailableReason = !fionaDirectLive
    ? "Fiona's local streaming chat is offline. Live voice cannot use queued inbox replies."
    : !voiceInputProvider
      ? "No speech-to-text input is available on this device."
      : !voiceOutputProvider
        ? "No speech output is available on this device."
        : null;
  const liveVoiceAvailable = liveVoiceUnavailableReason === null;
  const allRoutedChatEntries = useMemo(
    () =>
      (agentChatQuery.data ?? [])
        .filter(isChatInboxItem)
        .map(inboxItemToChatEntry),
    [agentChatQuery.data],
  );
  const routedChatEntries = useMemo(() => {
    const currentEntries = allRoutedChatEntries.filter((entry) => !clearedAt || entry.createdAt > clearedAt);
    if (!historySearchOpen) return currentEntries;
    return filterAgentPanelChatReceipts(allRoutedChatEntries, historySearch);
  }, [allRoutedChatEntries, clearedAt, historySearch, historySearchOpen]);

  const completedReplies = useMemo(() => {
    const byId = new Map<string, AgentChatEntry>();
    for (const entry of [...chatEntries, ...allRoutedChatEntries]) {
      if (!entry.reply || !entry.repliedAt) continue;
      byId.set(entry.id, entry);
    }
    return Array.from(byId.values());
  }, [allRoutedChatEntries, chatEntries]);
  const latestReplyAt = useMemo(() => latestAgentPanelReplyAt(completedReplies), [completedReplies]);
  const unreadCount = useMemo(
    () => countUnreadAgentPanelReplies(completedReplies, lastReadAt),
    [completedReplies, lastReadAt],
  );
  const markRepliesRead = useCallback(() => {
    if (!latestReplyAt || latestReplyAt <= lastReadAt) return;
    setLastReadAt(latestReplyAt);
    try {
      window.localStorage.setItem(CHAT_LAST_READ_KEY, latestReplyAt);
    } catch {
      /* unread state remains correct for this mounted panel */
    }
  }, [lastReadAt, latestReplyAt]);
  const visibleLocalChatEntries = useMemo(() => {
    if (!historySearchOpen) return chatEntries;
    return filterAgentPanelChatReceipts(chatEntries, historySearch);
  }, [chatEntries, historySearch, historySearchOpen]);
  // Thread: request/response rows flattened into chronological message turns.
  // Server rows win over local optimistic entries carrying the same message
  // (direct dispatches get their durable row when the agent writes back).
  const chatTurns = useMemo(() => {
    const routedMessages = new Set(routedChatEntries.map((entry) => entry.message.trim()));
    const localContextByMessage = new Map(
      visibleLocalChatEntries
        .filter((entry) => entry.context)
        .map((entry) => [entry.message.trim(), entry.context] as const),
    );
    const entriesById = new Map<string, AgentChatEntry>();
    for (const entry of visibleLocalChatEntries) {
      if (routedMessages.has(entry.message.trim())) continue;
      entriesById.set(entry.id, entry);
    }
    for (const entry of routedChatEntries) {
      entriesById.set(entry.id, {
        ...entry,
        // Legacy inbox rows did not persist the snapshot. Preserve the local
        // optimistic copy while it exists instead of erasing visible context.
        context: entry.context ?? localContextByMessage.get(entry.message.trim()) ?? null,
      });
    }
    return entriesToTurns(Array.from(entriesById.values()));
  }, [routedChatEntries, visibleLocalChatEntries]);
  const conversationTimeline = useMemo(
    () => [
      ...chatTurns.map((turn) => ({ kind: "turn" as const, ts: turn.ts, turn })),
      ...(historySearchOpen ? [] : inlineActions.map((event) => ({ kind: "action" as const, ts: event.createdAt, event }))),
    ].sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime()),
    [chatTurns, historySearchOpen, inlineActions],
  );
  const awaitingReply = chatTurns.some((turn) => turn.role === "user" && turn.status === "queued");

  // Tighten the poll safety net while a reply is outstanding.
  useEffect(() => {
    if (!expanded || !awaitingReply) return;
    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["agent-panel", "chat-receipts"] });
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [expanded, awaitingReply, queryClient]);

  // Follow new content only while Adam is already at the newest message.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread && followLatestRef.current) {
      thread.scrollTop = thread.scrollHeight;
      setShowReturnToLatest(false);
    }
  }, [conversationTimeline.length, isSendingChat, streamingReply]);

  useEffect(() => {
    liveVoiceStateRef.current = liveVoice;
  }, [liveVoice]);

  useEffect(() => {
    return () => {
      liveVoiceEpochRef.current += 1;
      dictationRef.current?.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      liveVoiceDictationRef.current?.stop();
      if (liveVoiceRecorderRef.current?.state === "recording") liveVoiceRecorderRef.current.stop();
      liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioRef.current?.pause();
      speechCompletionRef.current?.();
      if (supportsBrowserSpeechSynthesis()) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => subscribeConversationContext(setConversationContext), []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatEntries.slice(0, LOCAL_CHAT_HISTORY_LIMIT)));
      historyStorageErrorShownRef.current = false;
    } catch (historyError) {
      if (!historyStorageErrorShownRef.current) {
        historyStorageErrorShownRef.current = true;
        toastError("Local chat history could not be saved", historyError);
      }
    }
  }, [chatEntries]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_DRAFT_KEY, chatDraft);
      draftStorageErrorShownRef.current = false;
    } catch (draftError) {
      if (!draftStorageErrorShownRef.current) {
        draftStorageErrorShownRef.current = true;
        toastError("Chat draft could not be saved", draftError);
      }
    }
  }, [chatDraft]);

  useEffect(() => {
    if (!expanded) return;
    if (document.visibilityState === "visible" && document.hasFocus()) markRepliesRead();
  }, [expanded, markRepliesRead]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      if (!standalone) {
        setUserCollapsed(false);
        try {
          window.localStorage.setItem(STORAGE_KEY, "0");
        } catch {
          /* the panel still opens for this session */
        }
      }
      setHistorySearchOpen(false);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [standalone]);

  function toggleCollapsed() {
    if (standalone) return;
    setUserCollapsed(() => {
      const next = !collapsed;
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
      agentChatQuery.refetch(),
      apiQuery.refetch(),
      profilesQuery.refetch(),
    ]);
  }

  async function handleStartWorkflow(workflowId: string) {
    const workflow = workflows.find((candidate) => candidate.workflow_id === workflowId);
    if (!workflow) return;
    setPlusMenuOpen(false);
    const result = await startWorkflowFromPanel({
      workflowId,
      triggerSource: "ui",
      entityScope: workflow.entity ?? undefined,
      context: {
        route: contextRouteLabel(conversationContext),
        source: "agent_panel",
        composer_note: chatDraft.trim() || null,
      },
    });
    if (!result) return;
    if (!("workflow_run_id" in result) || !result.workflow_run_id) {
      toast.error("Workflow start could not be verified", {
        description: "No Workflow Run ID was returned. Check the registry before trying again.",
      });
      return;
    }
    const occurredAt = new Date().toISOString();
    setInlineActions((current) => [
      ...current,
      normalizeLocalActionEvent({
        id: `workflow-${result.workflow_run_id}`,
        actionKind: "workflow",
        label: workflow.name,
        observedState: "completed",
        createdAt: occurredAt,
        summary: result.current_step ?? "Workflow Run created and dispatched.",
        correlation: {
          correlationId: result.workflow_run_id,
          databaseId: GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns,
          recordId: result.workflow_run_id,
          workflowRunId: result.workflow_run_id,
        },
        evidence: { kind: "workflow_run", id: result.workflow_run_id },
      }),
    ]);
  }

  async function sendChatMessage(messageOverride?: string, options: SendChatOptions = {}) {
    const message = (messageOverride ?? chatDraft).trim();
    if (!message || (isSendingChat && !options.steering)) return;
    const liveVoiceTurnEpoch = options.liveVoice ? liveVoiceEpochRef.current : null;

    // Streaming path: direct conversation over the Hermes API server.
    if (fionaDirectLive) {
      const entryId = `api-${Date.now()}`;
      const sentAt = new Date().toISOString();
      const sentContext = conversationContext;
      if (!options.preserveDraft) setChatDraft("");
      setIsSendingChat(true);
      setStreamingReply("");
      setChatEntries((current) => [
        { id: entryId, message, targetAgent, status: "submitted" as ChatEntryStatus, detail: "hermes api", createdAt: sentAt, context: sentContext },
        ...current,
      ].slice(0, LOCAL_CHAT_HISTORY_LIMIT));
      let accumulated = "";
      let completedLiveVoiceTurn = false;
      const controller = new AbortController();
      abortRef.current = controller;
      const requestHistory = options.historyOverride ?? chatTurns
        .filter((turn) => Boolean(turn.text))
        .slice(-12)
        .map((turn) => ({
          role: turn.role === "user" ? ("user" as const) : ("assistant" as const),
          content: turn.text ?? "",
        }));
      try {
        // Stateless continuity: replay the visible thread as history
        // (custom session headers are CORS-blocked by Hermes today).
        const result = await streamHermesChat({
          message,
          history: requestHistory,
          systemPrompt: `${GENUI_SYSTEM_PROMPT}${contextPromptBlock(sentContext)}`,
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
                  widgets,
                  repliedAt: new Date().toISOString(),
                }
              : entry,
          ),
        );
        notifyWorkspaceMayHaveChanged();
        if (options.liveVoice) {
          if (!cleanReply || !voiceOutputProvider) {
            dispatchLiveVoice({ type: "FAIL", message: "Fiona returned no speakable reply." });
          } else {
            dispatchLiveVoice({ type: "SPEAKING" });
            setIsSpeaking(true);
            try {
              await speakWithProvider(cleanReply, voiceOutputProvider.id);
              completedLiveVoiceTurn = liveVoiceTurnEpoch === liveVoiceEpochRef.current;
            } catch (voiceError) {
              setIsSpeaking(false);
              if (liveVoiceTurnEpoch === liveVoiceEpochRef.current) {
                dispatchLiveVoice({
                  type: "FAIL",
                  message: voiceError instanceof Error ? voiceError.message : "Fiona's speech output failed.",
                });
                toastError("Voice output failed", voiceError);
              }
            }
          }
        } else if (speakReplies && cleanReply && voiceOutputProvider) {
          setIsSpeaking(true);
          void speakWithProvider(cleanReply, voiceOutputProvider.id).catch((voiceError) => {
            setIsSpeaking(false);
            toastError("Voice output failed", voiceError);
          });
        }
      } catch (streamError) {
        const stopped = streamError instanceof DOMException && streamError.name === "AbortError";
        setChatEntries((current) =>
          current.map((entry) =>
            entry.id === entryId
              ? stopped
                ? {
                    ...entry,
                    status: "cancelled" as ChatEntryStatus,
                    reply: accumulated || null,
                    repliedAt: new Date().toISOString(),
                    detail: "Stopped by user",
                  }
                : { ...entry, status: "failed" as ChatEntryStatus, detail: streamError instanceof Error ? streamError.message : "Stream failed" }
              : entry,
          ),
        );
        if (!stopped) {
          if (options.liveVoice) {
            dispatchLiveVoice({
              type: "FAIL",
              message: streamError instanceof Error ? streamError.message : "Fiona's voice reply failed.",
            });
          }
          toastError("Hermes chat failed", streamError);
        }
      } finally {
        const pendingSteer = pendingSteerRef.current;
        pendingSteerRef.current = null;
        abortRef.current = null;
        setStreamingReply(null);
        setIsSendingChat(false);
        if (options.liveVoice) {
          if (completedLiveVoiceTurn) {
            dispatchLiveVoice({ type: "TURN_COMPLETE" });
            if (liveVoiceShouldListenRef.current) {
              const epoch = liveVoiceEpochRef.current;
              queueMicrotask(() => void startLiveVoiceListening(epoch));
            }
          }
        } else if (pendingSteer) {
          queueMicrotask(() => void sendChatMessage(pendingSteer, {
            historyOverride: buildSteeredAgentPanelHistory(requestHistory, message, accumulated),
            preserveDraft: true,
            steering: true,
          }));
        } else {
          queueMicrotask(() => composerRef.current?.focus());
        }
      }
      return;
    }

    if (options.liveVoice) {
      dispatchLiveVoice({
        type: "FAIL",
        message: "Fiona's live streaming connection is unavailable. Voice turns are not queued.",
      });
      return;
    }

    try {
      setIsSendingChat(true);
      const sentContext = conversationContext;
      const result = await sendToAgentChat({
        message,
        targetAgent,
        profile: targetProfile?.name ?? null,
        context: {
          type: "agent_panel_chat",
          route: contextRouteLabel(sentContext) ?? undefined,
          payload: {
            target_agent: targetAgent,
            conversation_context: sentContext,
            context_references: sentContext?.selections ?? [],
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
          context: sentContext,
        },
        ...current,
      ].slice(0, LOCAL_CHAT_HISTORY_LIMIT));
      if (!options.preserveDraft) setChatDraft("");
      queueMicrotask(() => composerRef.current?.focus());
      toast.success(status === "submitted" ? "Message sent to Fiona" : "Message queued for Fiona", {
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
          context: conversationContext,
        },
        ...current,
      ].slice(0, LOCAL_CHAT_HISTORY_LIMIT));
      toastError("Fiona chat failed", chatError);
    } finally {
      setIsSendingChat(false);
      queueMicrotask(() => composerRef.current?.focus());
    }
  }

  function submitComposer() {
    const message = chatDraft.trim();
    if (!message) return;
    if (isSendingChat && streamingReply !== null) {
      pendingSteerRef.current = message;
      setChatDraft("");
      abortRef.current?.abort();
      toast.info("Steering Fiona with your update");
      return;
    }
    void sendChatMessage();
  }

  function stopActiveResponse() {
    pendingSteerRef.current = null;
    abortRef.current?.abort();
  }

  async function copyMessageMarkdown(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard access was denied.");
      }
      toast.success("Message copied as markdown");
    } catch (clipboardError) {
      toastError("Message could not be copied", clipboardError);
    }
  }

  async function addTextAttachments(files: File[]) {
    const selected = files.slice(0, MAX_CHAT_TEXT_FILES);
    if (files.length > MAX_CHAT_TEXT_FILES) {
      toast.info(`Only the first ${MAX_CHAT_TEXT_FILES} text files were added.`);
    }

    const formatted: string[] = [];
    for (const file of selected) {
      if (!supportsChatTextFile(file)) {
        toast.error(file.type.startsWith("image/") ? "Image attachments are not supported yet" : "File type not supported", {
          description: `${file.name} cannot be sent through the current Hermes text transport.`,
        });
        continue;
      }
      if (file.size > MAX_CHAT_TEXT_FILE_BYTES) {
        toast.error("Text file is too large", {
          description: `${file.name} must be smaller than ${Math.round(MAX_CHAT_TEXT_FILE_BYTES / 1000)} KB.`,
        });
        continue;
      }
      try {
        formatted.push(formatChatTextAttachment(file.name, await file.text()));
      } catch (fileError) {
        toastError(`Could not read ${file.name}`, fileError);
      }
    }

    if (formatted.length > 0) {
      setChatDraft((current) => formatted.reduce(appendToDraft, current));
      toast.success(formatted.length === 1 ? "Text file added" : `${formatted.length} text files added`);
      queueMicrotask(() => composerRef.current?.focus());
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
        let result: Awaited<ReturnType<typeof transcribeWithHermes>>;
        try {
          result = await transcribeWithHermes(audio);
        } catch (previewError) {
          if (!hermesPreviewErrorShownRef.current) {
            hermesPreviewErrorShownRef.current = true;
            toastError("Live dictation preview failed", previewError);
          }
          return;
        }
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
      hermesPreviewErrorShownRef.current = false;
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

  function stopLiveVoiceCapture() {
    liveVoiceDictationRef.current?.stop();
    liveVoiceDictationRef.current = null;
    const recorder = liveVoiceRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else liveVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveVoiceRecorderRef.current = null;
    liveVoiceStreamRef.current = null;
  }

  function resetLiveVoiceTranscript() {
    liveVoiceTranscriptRef.current = "";
    liveVoiceInterimRef.current = "";
  }

  function failLiveVoice(message: string) {
    liveVoiceShouldListenRef.current = false;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    dispatchLiveVoice({ type: "FAIL", message });
  }

  function sendLiveVoiceTranscript(transcript: string) {
    const normalized = transcript.trim();
    if (!normalized) {
      failLiveVoice("No speech was captured. Try the turn again.");
      return;
    }
    liveVoiceShouldListenRef.current = !liveVoiceStateRef.current.muted;
    dispatchLiveVoice({ type: "THINKING", transcript: normalized });
    void sendChatMessage(normalized, { preserveDraft: true, liveVoice: true });
  }

  function finishBrowserLiveVoiceTurn(epoch: number) {
    if (!liveVoiceSubmitPendingRef.current || epoch !== liveVoiceEpochRef.current) return;
    liveVoiceSubmitPendingRef.current = false;
    const transcript = liveVoiceTranscriptRef.current.trim() || liveVoiceInterimRef.current.trim();
    sendLiveVoiceTranscript(transcript);
  }

  async function startLiveVoiceListening(epoch = liveVoiceEpochRef.current) {
    if (
      epoch !== liveVoiceEpochRef.current ||
      !liveVoiceShouldListenRef.current ||
      !voiceInputProvider
    ) {
      return;
    }

    resetLiveVoiceTranscript();
    dispatchLiveVoice({ type: "LISTENING" });

    if (voiceInputProvider.id === "browser") {
      const session = startBrowserDictation({
        onFinal: (text) => {
          if (epoch !== liveVoiceEpochRef.current) return;
          liveVoiceTranscriptRef.current = joinDraft(liveVoiceTranscriptRef.current, text);
          dispatchLiveVoice({ type: "TRANSCRIPT", final: text, interim: "" });
        },
        onInterim: (text) => {
          if (epoch !== liveVoiceEpochRef.current) return;
          liveVoiceInterimRef.current = text;
          dispatchLiveVoice({ type: "TRANSCRIPT", interim: text });
        },
        onError: (message) => {
          if (epoch === liveVoiceEpochRef.current) failLiveVoice(message);
        },
        onEnd: () => {
          liveVoiceDictationRef.current = null;
          if (epoch !== liveVoiceEpochRef.current) return;
          if (liveVoiceSubmitPendingRef.current) {
            finishBrowserLiveVoiceTurn(epoch);
          } else if (liveVoiceShouldListenRef.current) {
            window.setTimeout(() => void startLiveVoiceListening(epoch), 250);
          }
        },
      });
      if (!session) {
        failLiveVoice("Browser speech recognition is unavailable.");
        return;
      }
      liveVoiceDictationRef.current = session;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      failLiveVoice("Audio recording is unavailable on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (epoch !== liveVoiceEpochRef.current || !liveVoiceShouldListenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      liveVoiceStreamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      liveVoiceRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (epoch === liveVoiceEpochRef.current) failLiveVoice("Audio recording stopped unexpectedly.");
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (liveVoiceStreamRef.current === stream) liveVoiceStreamRef.current = null;
        if (liveVoiceRecorderRef.current === recorder) liveVoiceRecorderRef.current = null;
        const shouldSubmit = liveVoiceSubmitPendingRef.current;
        liveVoiceSubmitPendingRef.current = false;
        const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!shouldSubmit || epoch !== liveVoiceEpochRef.current) return;
        if (audio.size === 0) {
          failLiveVoice("No audio was captured. Try the turn again.");
          return;
        }
        void transcribeWithHermes(audio).then((result) => {
          if (epoch !== liveVoiceEpochRef.current) return;
          dispatchLiveVoice({ type: "TRANSCRIPT", final: result.transcript, interim: "" });
          sendLiveVoiceTranscript(result.transcript);
        }).catch((error) => {
          if (epoch !== liveVoiceEpochRef.current) return;
          failLiveVoice(error instanceof Error ? error.message : "Hermes transcription failed.");
        });
      };
      recorder.start();
    } catch (error) {
      failLiveVoice(error instanceof Error ? error.message : "Microphone access failed.");
    }
  }

  function startLiveVoiceListeningWhenIdle(epoch: number) {
    if (epoch !== liveVoiceEpochRef.current || !liveVoiceShouldListenRef.current) return;
    if (abortRef.current) {
      window.setTimeout(() => startLiveVoiceListeningWhenIdle(epoch), 50);
      return;
    }
    void startLiveVoiceListening(epoch);
  }

  function startLiveVoiceSession() {
    setPlusMenuOpen(false);
    if (isListening) {
      dictationRef.current?.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      setIsListening(false);
      setInterimTranscript("");
    }
    liveVoiceShouldListenRef.current = false;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    abortRef.current?.abort();
    stopSpeaking();
    liveVoiceEpochRef.current += 1;
    resetLiveVoiceTranscript();
    dispatchLiveVoice({
      type: "START",
      available: liveVoiceAvailable,
      reason: liveVoiceUnavailableReason ?? undefined,
    });
    if (!liveVoiceAvailable) {
      liveVoiceShouldListenRef.current = false;
      return;
    }
    liveVoiceShouldListenRef.current = true;
    startLiveVoiceListeningWhenIdle(liveVoiceEpochRef.current);
  }

  function submitLiveVoiceTurn() {
    if (liveVoice.phase !== "listening") return;
    liveVoiceSubmitPendingRef.current = true;
    liveVoiceShouldListenRef.current = false;
    dispatchLiveVoice({ type: "TRANSCRIBING" });
    if (voiceInputProvider?.id === "browser") {
      const dictation = liveVoiceDictationRef.current;
      if (!dictation) {
        failLiveVoice("The microphone is not listening. Try the turn again.");
        return;
      }
      dictation.stop();
      return;
    }
    const recorder = liveVoiceRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else failLiveVoice("The microphone is not recording. Start the turn again.");
  }

  function toggleLiveVoiceMute() {
    if (liveVoice.muted) {
      dispatchLiveVoice({ type: "UNMUTE" });
      liveVoiceShouldListenRef.current = true;
      if (!["transcribing", "thinking", "speaking"].includes(liveVoice.phase)) {
        liveVoiceEpochRef.current += 1;
        void startLiveVoiceListening(liveVoiceEpochRef.current);
      }
      return;
    }

    dispatchLiveVoice({ type: "MUTE" });
    liveVoiceShouldListenRef.current = false;
    if (liveVoice.phase === "listening") {
      liveVoiceEpochRef.current += 1;
      liveVoiceSubmitPendingRef.current = false;
      stopLiveVoiceCapture();
    }
  }

  function interruptLiveVoice() {
    liveVoiceEpochRef.current += 1;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    abortRef.current?.abort();
    stopSpeaking();
    dispatchLiveVoice({ type: "INTERRUPT" });
    liveVoiceShouldListenRef.current = !liveVoice.muted;
    if (!liveVoice.muted) startLiveVoiceListeningWhenIdle(liveVoiceEpochRef.current);
  }

  function endLiveVoiceSession() {
    liveVoiceEpochRef.current += 1;
    liveVoiceShouldListenRef.current = false;
    liveVoiceSubmitPendingRef.current = false;
    stopLiveVoiceCapture();
    if (["thinking", "speaking"].includes(liveVoice.phase)) abortRef.current?.abort();
    stopSpeaking();
    resetLiveVoiceTranscript();
    dispatchLiveVoice({ type: "END" });
  }

  function startNewSession() {
    const now = new Date().toISOString();
    try {
      window.localStorage.removeItem(HERMES_SESSION_KEY);
      window.localStorage.setItem(CHAT_CLEARED_KEY, now);
      window.localStorage.removeItem(CHAT_HISTORY_KEY);
    } catch (storageError) {
      setConfirmNewSessionOpen(false);
      toastError("Could not start a new chat session", storageError);
      return;
    }
    setClearedAt(now);
    setChatEntries([]);
    setInlineActions([]);
    setHistorySearchOpen(false);
    setHistorySearch("");
    setPlusMenuOpen(false);
    setConfirmNewSessionOpen(false);
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
    speechGenerationRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    speechCompletionRef.current?.();
    speechCompletionRef.current = null;
    if (supportsBrowserSpeechSynthesis()) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  async function speakWithProvider(text: string, providerId: VoiceProviderId) {
    const generation = ++speechGenerationRef.current;
    if (providerId === "hermes") {
      const result = await speakWithHermes(text);
      if (generation !== speechGenerationRef.current) return;
      const audio = new Audio(result.dataUrl);
      audioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (speechCompletionRef.current === finish) speechCompletionRef.current = null;
          audioRef.current = null;
          setIsSpeaking(false);
          resolve();
        };
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          if (speechCompletionRef.current === finish) speechCompletionRef.current = null;
          audioRef.current = null;
          setIsSpeaking(false);
          reject(error);
        };
        speechCompletionRef.current = finish;
        audio.onended = finish;
        audio.onerror = () => fail(new Error("The generated audio could not be played."));
        void audio.play().catch((error) => fail(error instanceof Error ? error : new Error("The generated audio could not be played.")));
      });
      return;
    }

    if (!supportsBrowserSpeechSynthesis()) throw new Error("Speech output unavailable.");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (speechCompletionRef.current === finish) speechCompletionRef.current = null;
        setIsSpeaking(false);
        resolve();
      };
      speechCompletionRef.current = finish;
      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (settled) return;
        settled = true;
        if (speechCompletionRef.current === finish) speechCompletionRef.current = null;
        setIsSpeaking(false);
        reject(new Error(event.error || "Speech synthesis stopped unexpectedly."));
      };
      window.speechSynthesis.cancel();
      if (generation !== speechGenerationRef.current) {
        finish();
        return;
      }
      window.speechSynthesis.speak(utterance);
    });
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
        sourceRoute: contextRouteLabel(conversationContext),
        sourceProvider: voiceInputProvider?.id ?? voiceOutputProvider?.id ?? null,
        confirmWrite: true,
      });
      toast.success("Task created from message", {
        description: result.task?.title ?? result.task_id,
      });
      const taskId = result.task_id;
      if (taskId) {
        const occurredAt = new Date().toISOString();
        setInlineActions((current) => [
          ...current,
          normalizeLocalActionEvent({
            id: `task-${taskId}`,
            actionKind: "tool",
            label: result.task?.title ?? "Task created",
            observedState: "completed",
            createdAt: occurredAt,
            summary: "Created a durable Task from the composer message.",
            correlation: {
              correlationId: taskId,
              databaseId: GENZEN_WORKSPACE_DATABASE_IDS.tasks,
              recordId: taskId,
            },
            evidence: { kind: "record_created", id: taskId },
          }),
        ]);
      }
      setChatDraft("");
    } catch (createError) {
      toastError("Task creation failed", createError);
    } finally {
      setIsCreatingVoiceTask(false);
    }
  }

  if (!standalone && collapsed) {
    return (
      <aside
        className="flex h-auto max-h-full w-12 shrink-0 flex-col items-center self-start overflow-hidden rounded-[28px] border border-[var(--border)] py-3"
        style={{ background: "var(--mantle)" }}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand agent panel"
          title="Expand agent panel"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
        >
          <PanelRightOpen className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] leading-4 text-[var(--crust)]">
              {Math.min(unreadCount, 99)}
            </span>
          ) : null}
        </button>
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
      style={
        standalone
          ? undefined
          : { width: panelWidth, background: "var(--mantle)" }
      }
      className={cn(
        "relative flex shrink-0 flex-col border border-[var(--border)]",
        standalone ? "h-full w-full rounded-none border-0 bg-[var(--mantle)]" : "h-full rounded-2xl",
      )}
      onFocusCapture={markRepliesRead}
      onPointerDown={markRepliesRead}
    >
      {!standalone ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize agent panel"
          onPointerDown={startPanelResize}
          className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-[var(--accent-border)]"
        />
      ) : null}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-ui text-[13px] font-semibold text-[var(--text)]">
              Agent Panel
              {unreadCount > 0 ? (
                <span className="rounded-full bg-[var(--accent)] px-1.5 font-mono text-[10px] leading-4 text-[var(--crust)]">
                  {Math.min(unreadCount, 99)} new
                </span>
              ) : null}
            </p>
            <p className="flex items-center gap-1.5 truncate font-ui text-[11px] text-[var(--overlay-1)]">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  hermesConnected ? "bg-[var(--success)]" : "bg-[var(--overlay-0)]",
                )}
              />
              {fionaDirectLive
                ? `Fiona · ${targetProfile?.model ?? "Hermes"}`
                : hermesConnected
                  ? "Fiona · durable inbox"
                  : "Fiona · queuing via inbox"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh agent panel"
            title="Refresh"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
          {!standalone ? (
            <>
              {onEject ? (
                <button
                  type="button"
                  onClick={onEject}
                  aria-label="Eject agent panel"
                  title="Eject agent panel"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Collapse agent panel"
                title="Collapse agent panel"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={threadRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={(event) => {
          const node = event.currentTarget;
          const atLatest = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
          followLatestRef.current = atLatest;
          setShowReturnToLatest(!atLatest);
        }}
      >
        {historySearchOpen ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" aria-hidden="true" />
            <input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Search past messages"
              aria-label="Search past messages"
              className="min-w-0 flex-1 bg-transparent font-ui text-[11.5px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
            />
            <button
              type="button"
              onClick={() => {
                setHistorySearchOpen(false);
                setHistorySearch("");
              }}
              aria-label="Close message history"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="mb-3 rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3">
            <p className="font-ui text-[12px] font-medium text-[var(--danger)]">Fiona is unavailable</p>
            <p className="mt-1 line-clamp-3 font-ui text-[11px] text-[var(--subtext-0)]">
              {error instanceof Error ? error.message : "Refresh failed."}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-2 rounded-full border border-[var(--border)] px-2.5 py-1 font-ui text-[10px] font-medium text-[var(--accent)] transition-colors hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              Retry
            </button>
          </div>
        ) : null}

        {agentChatQuery.isLoading && conversationTimeline.length === 0 ? (
          <div className="space-y-2 px-2.5 py-2" role="status" aria-label="Loading conversation">
            <div className="h-3 w-16 rounded-full bg-[var(--surface-0)]" />
            <div className="h-8 w-full rounded-md bg-[var(--surface-wash)]" />
            <div className="h-3 w-14 rounded-full bg-[var(--surface-0)]" />
            <div className="h-12 w-5/6 rounded-md bg-[var(--surface-wash)]" />
          </div>
        ) : conversationTimeline.length === 0 && !agentChatQuery.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="font-ui text-[12px] text-[var(--subtext-0)]">
              {historySearchOpen ? "No past messages match this search." : "Message Fiona to get started."}
            </p>
            {!historySearchOpen ? (
              <p className="font-ui text-[11px] leading-relaxed text-[var(--overlay-1)]">
                Route context travels with every message. Use + for workflows and actions.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {conversationTimeline.map((item, index) => {
              if (item.kind === "action") {
                return <AgentActionEvent key={item.event.id} event={item.event} />;
              }
              const { turn } = item;
              const previous = conversationTimeline
                .slice(0, index)
                .reverse()
                .find((candidate) => candidate.kind === "turn")?.turn;
              const turnsBefore = conversationTimeline
                .slice(0, index)
                .flatMap((candidate) => candidate.kind === "turn" ? [candidate.turn] : []);
              const previousUserPosition = turnsBefore.reduce(
                (found, candidate, turnIndex) => candidate.role === "user" ? turnIndex : found,
                -1,
              );
              const previousUser = previousUserPosition >= 0 ? turnsBefore[previousUserPosition] : undefined;
              const retryHistory = turnsBefore
                .slice(0, previousUserPosition)
                .filter((candidate) => Boolean(candidate.text))
                .slice(-12)
                .map((candidate) => ({
                  role: candidate.role === "user" ? ("user" as const) : ("assistant" as const),
                  content: candidate.text ?? "",
                }));
              const isLatestAssistant = turn.role === "agent" && !conversationTimeline
                .slice(index + 1)
                .some((candidate) => candidate.kind === "turn" && candidate.turn.role === "agent");
              const gapMs = previous ? new Date(turn.ts).getTime() - new Date(previous.ts).getTime() : Infinity;
              const showDivider = gapMs > TIME_DIVIDER_GAP_MS;
              const speakerChanged = !previous || previous.speaker !== turn.speaker || showDivider;
              return (
                <div key={turn.id}>
                  {showDivider ? (
                    <p className="py-1.5 text-center font-mono text-[10px] text-[var(--overlay-1)]">{formatRunTime(turn.ts)}</p>
                  ) : null}
                  {/* VS Code-style turns: full-width blocks, speaker label, no bubbles. */}
                  {turn.role === "user" ? (
                    <div className="group/turn relative rounded-md bg-[var(--surface-wash)] px-2.5 py-2">
                      {speakerChanged ? (
                        <span className="mb-0.5 block font-ui text-[10px] font-semibold text-[var(--subtext-0)]">You</span>
                      ) : null}
                      <p className="whitespace-pre-wrap font-ui text-[12.5px] leading-relaxed text-[var(--text)]">{turn.text}</p>
                      {contextRouteLabel(turn.context) ? (
                        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Context sent with this message">
                          <span className="max-w-full truncate rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--overlay-1)]">
                            {contextRouteLabel(turn.context)}
                          </span>
                          {turn.context?.selections.map((selection) => (
                            <span
                              key={`${selection.kind}:${JSON.stringify(selection)}`}
                              className="max-w-full truncate rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--overlay-1)]"
                            >
                              {selection.label ?? selection.kind.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {turn.status === "queued" ? (
                        <p className="mt-1 font-ui text-[10px] italic text-[var(--overlay-1)]">Waiting for agent…</p>
                      ) : turn.status === "failed" ? (
                        <div className="mt-1 flex items-center gap-2">
                          <p className="font-ui text-[10px] text-[var(--danger)]">Failed — {turn.detail}</p>
                          <button
                            type="button"
                            className="font-ui text-[10px] font-medium text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                            onClick={() => {
                              setChatDraft(turn.text ?? "");
                              queueMicrotask(() => composerRef.current?.focus());
                            }}
                          >
                            Retry
                          </button>
                        </div>
                      ) : null}
                      {turn.text ? (
                        <div className="absolute right-1 top-1 opacity-0 transition-opacity duration-150 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setChatDraft(turn.text ?? "");
                              setHistorySearchOpen(false);
                              queueMicrotask(() => composerRef.current?.focus());
                            }}
                            aria-label="Edit and resend"
                            title="Edit and resend"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mantle)] text-[var(--overlay-1)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="group/turn relative px-2.5">
                      {speakerChanged ? (
                        <span className="mb-0.5 block font-ui text-[10px] font-semibold text-[var(--accent)]">{agentDisplayName(turn.speaker)}</span>
                      ) : null}
                      {turn.text ? (
                        <MarkdownBody content={turn.text} className="agent-chat-markdown" />
                      ) : null}
                      {turn.widgets?.map((widget, widgetIndex) => (
                        <AgentChatWidget key={`${turn.id}-widget-${widgetIndex}`} widget={widget} pinnable />
                      ))}
                      {turn.status === "cancelled" ? (
                        <p className="mt-1 font-ui text-[10px] italic text-[var(--overlay-1)]" role="status" aria-live="polite">
                          Response stopped.
                        </p>
                      ) : null}
                      <div className="absolute right-1 top-0 z-10 flex items-center gap-0.5 rounded-md bg-[var(--mantle)] p-0.5 opacity-0 transition-opacity duration-150 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100">
                        {turn.text ? (
                          <button
                            type="button"
                            onClick={() => void copyMessageMarkdown(turn.text ?? "")}
                            aria-label="Copy markdown"
                            title="Copy markdown"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                          >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          </button>
                        ) : null}
                        {isLatestAssistant && previousUser?.text ? (
                          <button
                            type="button"
                            disabled={isSendingChat}
                            onClick={() => void sendChatMessage(previousUser.text ?? "", {
                              historyOverride: retryHistory,
                              preserveDraft: true,
                            })}
                            aria-label="Retry answer"
                            title="Retry answer"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {streamingReply !== null ? (
          <div className="mt-3 px-2.5" aria-live="polite" aria-atomic="false">
            <span className="mb-0.5 block font-ui text-[10px] font-semibold text-[var(--accent)]">{agentDisplayName(targetAgent)}</span>
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

      {showReturnToLatest ? (
        <div className="flex shrink-0 justify-center border-t border-[var(--border-subtle)] py-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--mantle)] px-2.5 py-1 font-ui text-[10.5px] text-[var(--subtext-0)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            onClick={() => {
              const thread = threadRef.current;
              if (thread) thread.scrollTop = thread.scrollHeight;
              followLatestRef.current = true;
              setShowReturnToLatest(false);
            }}
          >
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            Latest
          </button>
        </div>
      ) : null}

      {liveVoice.active ? (
        <section
          aria-label="Live voice session"
          className="mx-3 mb-2 shrink-0 rounded-xl border border-[var(--accent-border)] bg-[var(--mantle)] p-3 shadow-[var(--shadow-elevated)]"
        >
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                liveVoice.phase === "error" || liveVoice.phase === "unavailable"
                  ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]",
              )}
              aria-hidden="true"
            >
              {liveVoice.phase === "listening" ? (
                <Mic className="h-3.5 w-3.5 animate-pulse" />
              ) : liveVoice.phase === "transcribing" || liveVoice.phase === "thinking" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : liveVoice.phase === "speaking" ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : liveVoice.phase === "muted" ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Headphones className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-ui text-[11px] font-semibold text-[var(--text)]" aria-live="polite">
                    {liveVoicePhaseLabel(liveVoice.phase)}
                  </p>
                  <p className="mt-0.5 font-ui text-[10px] leading-snug text-[var(--overlay-1)]">
                    Turn-taking voice: speak, send the turn, then Fiona replies. This is not full-duplex.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={endLiveVoiceSession}
                  aria-label="End live voice session"
                  title="End live voice session"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {liveVoice.error ? (
                <p className="mt-2 rounded-md bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-2 py-1.5 font-ui text-[10.5px] leading-snug text-[var(--danger)]" role="alert">
                  {liveVoice.error}
                </p>
              ) : null}

              {liveVoice.transcript || liveVoice.interimTranscript ? (
                <p className="mt-2 line-clamp-3 font-ui text-[11px] italic leading-snug text-[var(--subtext-0)]" aria-live="polite">
                  “{liveVoice.transcript || liveVoice.interimTranscript}”
                </p>
              ) : null}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {liveVoice.phase === "listening" ? (
                  <button
                    type="button"
                    onClick={submitLiveVoiceTurn}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 font-ui text-[10.5px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                  >
                    <Send className="h-3 w-3" aria-hidden="true" />
                    Send turn
                  </button>
                ) : null}
                {liveVoice.phase === "transcribing" || liveVoice.phase === "thinking" || liveVoice.phase === "speaking" ? (
                  <button
                    type="button"
                    onClick={interruptLiveVoice}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--danger)_34%,transparent)] px-2.5 font-ui text-[10.5px] font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                  >
                    <Square className="h-3 w-3" aria-hidden="true" />
                    Interrupt
                  </button>
                ) : null}
                {liveVoice.phase === "error" || liveVoice.phase === "unavailable" ? (
                  <button
                    type="button"
                    onClick={startLiveVoiceSession}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 font-ui text-[10.5px] font-medium text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Try again
                  </button>
                ) : null}
                {liveVoice.phase !== "error" && liveVoice.phase !== "unavailable" ? (
                  <button
                    type="button"
                    onClick={toggleLiveVoiceMute}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 font-ui text-[10.5px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                  >
                    {liveVoice.muted ? <Mic className="h-3 w-3" aria-hidden="true" /> : <MicOff className="h-3 w-3" aria-hidden="true" />}
                    {liveVoice.muted ? "Unmute" : "Mute mic"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={endLiveVoiceSession}
                  className="inline-flex h-7 items-center px-2 font-ui text-[10.5px] text-[var(--overlay-1)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  End session
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="shrink-0 px-3 pb-3 pt-1">
        {contextRouteLabel(conversationContext) ? (
          <div className="mb-1.5 flex min-w-0 items-center gap-1 px-1" aria-label="Context that will be sent">
            <span className="shrink-0 font-ui text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">Context</span>
            <span className="min-w-0 truncate rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--subtext-0)]">
              {contextRouteLabel(conversationContext)}
            </span>
          </div>
        ) : null}
        <div
          className="relative rounded-lg bg-[var(--base)]"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            if (event.dataTransfer.files.length === 0) return;
            event.preventDefault();
            void addTextAttachments(Array.from(event.dataTransfer.files));
          }}
        >
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
                  onClick={toggleSpeakReplies}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Volume2 className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  {speakReplies ? "Speak replies: on" : "Speak replies: off"}
                </button>
                <button
                  type="button"
                  onClick={startLiveVoiceSession}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Headphones className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  {liveVoice.active
                    ? "Restart live voice session"
                    : liveVoiceAvailable
                      ? "Start live voice session"
                      : "Live voice unavailable"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    setHistorySearchOpen(true);
                    setHistorySearch("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Search className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  Search past messages
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    setConfirmNewSessionOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <RefreshCw className="h-3 w-3 shrink-0 text-[var(--overlay-1)]" />
                  New chat session
                </button>
              </div>
            </>
          ) : null}

          <textarea
            ref={composerRef}
            aria-keyshortcuts="Meta+Shift+A Control+Shift+A"
            title="Focus Agent Panel: ⌘⇧A"
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            onPaste={(event) => {
              if (event.clipboardData.files.length === 0) return;
              event.preventDefault();
              void addTextAttachments(Array.from(event.clipboardData.files));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitComposer();
              }
            }}
            rows={3}
            placeholder={`Message ${agentDisplayName(targetAgent)}…`}
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
              aria-expanded={plusMenuOpen}
              aria-haspopup="menu"
              title="Workflows and actions"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
                plusMenuOpen
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
              )}
            >
              {isStartingWorkflow ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="text/*,.csv,.json,.log,.md,.mdx,.xml,.yaml,.yml"
              className="sr-only"
              onChange={(event) => {
                if (event.target.files?.length) void addTextAttachments(Array.from(event.target.files));
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach text file"
              title="Attach text file (paste or drop also works)"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <span className="px-1 font-ui text-[11px] text-[var(--subtext-0)]">Fiona</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={startVoiceDraft}
              disabled={!canListen || liveVoice.active}
              aria-label={isListening ? "Stop dictation" : "Dictate"}
              title={liveVoice.active ? "End live voice before using dictation" : isListening ? "Stop dictation" : "Dictate"}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
                isListening
                  ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
                  : "text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
              )}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            {isSpeaking && !liveVoice.active ? (
              <button
                type="button"
                onClick={stopSpeaking}
                aria-label="Stop speaking"
                title="Stop speaking"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] transition-colors"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : null}
            {isSendingChat && streamingReply !== null ? (
              <>
                <button
                  type="button"
                  onClick={stopActiveResponse}
                  aria-label="Stop response"
                  title="Stop response"
                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={submitComposer}
                  disabled={!chatDraft.trim()}
                  aria-label="Steer Fiona"
                  title="Send this update and steer Fiona"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={submitComposer}
                disabled={!chatDraft.trim() || isSendingChat}
                aria-label="Send message"
                title="Send (Enter)"
                className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
              >
                {isSendingChat ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmNewSessionOpen}
        title="Start a new chat session?"
        message="This clears the conversation currently visible in the Agent Panel. Durable workspace records and receipts are not deleted."
        confirmLabel="Start new session"
        onConfirm={startNewSession}
        onCancel={() => setConfirmNewSessionOpen(false)}
      />
      {!standalone ? <PaneResizeEdges east hideLeft /> : null}
    </aside>
  );
}
