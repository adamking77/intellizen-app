import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { ArrowDown, Copy, FileText, Headphones, LoaderCircle, Mic, MicOff, PanelRightOpen, Paperclip, Pencil, Play, Plus, RefreshCw, RotateCcw, Search, Send, Square, Volume2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AgentActiveWork } from "@/components/agent/agent-active-work";
import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { AgentActionEvent } from "@/components/agent/agent-action-event";
import { AgentPanelComposer } from "@/components/agent/agent-panel-composer";
import { AgentPanelHeader } from "@/components/agent/agent-panel-header";
import { AgentPanelShell } from "@/components/agent/agent-panel-shell";
import { AgentPanelThread } from "@/components/agent/agent-panel-thread";
import { useAgentPanelConversation } from "@/components/agent/use-agent-panel-conversation";
import {
  AGENT_PANEL_MAX_WIDTH,
  AGENT_PANEL_MIN_WIDTH,
  useAgentPanelResize,
} from "@/components/agent/use-agent-panel-resize";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { MarkdownBody } from "@/components/ui/markdown-body";
import {
  parseAgentChatResult,
  stripGenuiForStreaming,
} from "@/lib/agent-widgets";
import { writeTextToClipboard } from "@/lib/clipboard";
import { WORKSPACE_REMOTE_WRITE_EVENT } from "@/lib/workspace-events";
import { selectActiveHermesProfile } from "@/lib/hermes-profiles";
import {
  countUnreadAgentPanelReplies,
  filterAgentPanelChatReceipts,
  latestAgentPanelReplyAt,
} from "@/lib/agent-panel-chat";
import {
  OPERATIONS_DIRECTOR_ROLE,
  PANEL_ROLE_CHANNEL,
  PANEL_SPEAK_REPLIES_KEY,
  PANEL_SELECTED_ROLE_KEY,
  PANEL_START_ROLE_KEY,
  panelRoleStorageKey,
  resolveInitialPanelRole,
} from "@/lib/agent-panel-roles";
import { TEAM_ROSTER_CHANNEL } from "@/lib/team-roster";
import { runnableWorkflows } from "@/lib/workflow-catalog";
import { liveVoicePhaseLabel } from "@/lib/live-voice-session";

import {
  createVoiceDraftTask,
  GENZEN_WORKSPACE_DATABASE_IDS,
  listFionaInboxItems,
  listWorkflows,
  OPERATOR_ACTOR,
} from "@/lib/data";
import type { FionaInboxItem } from "@/lib/types";
import {
  AGENT_PANEL_COLLAPSED_KEY,
  AGENT_PANEL_WIDTH_KEY,
  entriesToTurns,
  persistAgentPanelDraft,
  persistAgentPanelHistory,
  readAgentPanelChatHistory,
  readAgentPanelCollapsed,
  readAgentPanelValue,
  readInitialAgentPanelRole,
  type AgentChatEntry,
  type ChatEntryStatus,
} from "@/lib/agent-panel-persistence";
import { toast, toastError } from "@/lib/toast";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import { useWindowSize } from "@/lib/use-window-size";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  conversationContextRouteLabel,
  conversationContextFromChatPayload,
  readConversationContext,
  subscribeConversationContext,
  type ConversationContextSnapshot,
} from "@/lib/conversation-context";
import { checkHermesApi, DEFAULT_HERMES_PROFILE, fetchHermesProfiles } from "@/services/agent";
import {
  normalizeLocalActionEvent,
  workflowRunActionState,
  type ConversationActionEvent,
} from "@/lib/agent-conversation";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";
import { inspectActiveWork } from "@/services/active-work";
import {
  previewAgentMessageDocument,
  saveAgentMessageDocument,
  type AgentMessageDocumentPreview,
} from "@/services/agent-message-document";
// Operational evidence may appear inline; canonical monitoring and decisions stay in Databases.
import {
  getPreferredVoiceInputProvider,
  getPreferredVoiceOutputProvider,
  getVoiceProviderStatus,
} from "@/services/voice";

const HERMES_SESSION_KEY = "intelizen:hermes-session-id";
const SPEAK_REPLIES_KEY = PANEL_SPEAK_REPLIES_KEY;
function panelStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const TIME_DIVIDER_GAP_MS = 15 * 60_000;

interface ChatPayloadContext {
  kind?: unknown;
  target_agent?: unknown;
  message?: unknown;
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
  const navigate = useNavigate();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(
    () => readInitialAgentPanelRole(panelStorage()),
  );
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() =>
    readAgentPanelCollapsed(panelStorage()),
  );
  const [isCreatingVoiceTask, setIsCreatingVoiceTask] = useState(false);
  const [chatDraft, setChatDraft] = useState(() =>
    selectedRoleKey
      ? readAgentPanelValue(
          panelStorage(),
          panelRoleStorageKey(selectedRoleKey, "draft"),
        )
      : "",
  );
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [lastReadAt, setLastReadAt] = useState(() =>
    selectedRoleKey
      ? readAgentPanelValue(
          panelStorage(),
          panelRoleStorageKey(selectedRoleKey, "last-read"),
          new Date().toISOString(),
        )
      : new Date().toISOString(),
  );
  const [speakReplies, setSpeakReplies] = useState(() => {
    try { return window.localStorage.getItem(SPEAK_REPLIES_KEY) === "1"; } catch { return false; }
  });
  const [clearedAt, setClearedAt] = useState<string | null>(() => {
    try {
      return selectedRoleKey
        ? window.localStorage.getItem(
            panelRoleStorageKey(selectedRoleKey, "cleared"),
          )
        : null;
    } catch { return null; }
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const stored = Number(
        window.localStorage.getItem(AGENT_PANEL_WIDTH_KEY),
      );
      return Number.isFinite(stored) && stored >= AGENT_PANEL_MIN_WIDTH
        ? Math.min(stored, AGENT_PANEL_MAX_WIDTH)
        : 336;
    } catch { return 336; }
  });
  const startPanelResize = useAgentPanelResize(setPanelWidth);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [confirmNewSessionOpen, setConfirmNewSessionOpen] = useState(false);
  const [documentPreview, setDocumentPreview] =
    useState<AgentMessageDocumentPreview | null>(null);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [chatEntries, setChatEntries] = useState<AgentChatEntry[]>(() =>
    readAgentPanelChatHistory(panelStorage(), selectedRoleKey),
  );
  const [inlineActions, setInlineActions] = useState<ConversationActionEvent[]>([]);
  const [conversationContext, setConversationContext] = useState<ConversationContextSnapshot | null>(() => readConversationContext());
  const threadRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftStorageErrorShownRef = useRef(false);
  const historyStorageErrorShownRef = useRef(false);
  const followLatestRef = useRef(true);
  const roleChannelRef = useRef<BroadcastChannel | null>(null);
  const cancelConversationRef = useRef<() => void>(() => {});
  const [showReturnToLatest, setShowReturnToLatest] = useState(false);
  const { isCramped } = useWindowSize();
  const standalone = mode === "standalone";
  // Explicit user choice wins; otherwise auto-collapse when cramped.
  const collapsed = userCollapsed ?? isCramped;
  const expanded = standalone || !collapsed;
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: ["agent-panel", "role-targets"],
    queryFn: listAgentPanelRoleTargets,
    staleTime: 30_000,
    refetchInterval: expanded ? 60_000 : false,
    enabled: expanded,
  });
  const roleTargets = rolesQuery.data ?? [];
  const selectedRole =
    roleTargets.find((role) => role.roleKey === selectedRoleKey) ?? null;
  const targetAgent = selectedRole?.agentKey ?? "";
  const fionaSelected =
    selectedRole?.roleKey === OPERATIONS_DIRECTOR_ROLE &&
    selectedRole.agentKey === "fiona" &&
    selectedRole.adapterId === "hermes";
  const applyRoleSelection = useCallback(
    (roleKey: string | null, broadcast = true) => {
      cancelConversationRef.current();
      setSelectedRoleKey(roleKey);
      setChatEntries(readAgentPanelChatHistory(panelStorage(), roleKey));
      setChatDraft(
        roleKey
          ? readAgentPanelValue(
              panelStorage(),
              panelRoleStorageKey(roleKey, "draft"),
            )
          : "",
      );
      setLastReadAt(
        roleKey
          ? readAgentPanelValue(
              panelStorage(),
              panelRoleStorageKey(roleKey, "last-read"),
              new Date().toISOString(),
            )
          : new Date().toISOString(),
      );
      setClearedAt(
        roleKey
          ? readAgentPanelValue(
              panelStorage(),
              panelRoleStorageKey(roleKey, "cleared"),
              "",
            ) || null
          : null,
      );
      setInlineActions([]);
      setHistorySearchOpen(false);
      setHistorySearch("");
      try {
        if (roleKey) {
          window.localStorage.setItem(PANEL_SELECTED_ROLE_KEY, roleKey);
        } else {
          window.localStorage.removeItem(PANEL_SELECTED_ROLE_KEY);
        }
      } catch {
        /* mounted state remains authoritative */
      }
      if (broadcast) {
        roleChannelRef.current?.postMessage({ roleKey });
      }
    },
    [],
  );

  useEffect(() => {
    if (!rolesQuery.isSuccess) return;
    const resolved = resolveInitialPanelRole({
      availableRoleKeys: roleTargets.map((role) => role.roleKey),
      selectedRole: selectedRoleKey,
      startRole:
        readAgentPanelValue(panelStorage(), PANEL_START_ROLE_KEY) || null,
    });
    if (resolved !== selectedRoleKey) applyRoleSelection(resolved);
  }, [
    applyRoleSelection,
    roleTargets,
    rolesQuery.isSuccess,
    selectedRoleKey,
  ]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(PANEL_ROLE_CHANNEL);
    roleChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ roleKey?: unknown; open?: unknown; collapsed?: unknown }>) => {
      if (typeof event.data?.roleKey === "string") {
        applyRoleSelection(event.data.roleKey, false);
      }
      if (event.data && "open" in event.data && event.data.open === true) {
        setUserCollapsed(false);
      }
      if (
        event.data &&
        "collapsed" in event.data &&
        event.data.collapsed === true
      ) {
        setUserCollapsed(true);
      }
    };
    return () => {
      roleChannelRef.current = null;
      channel.close();
    };
  }, [applyRoleSelection]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(TEAM_ROSTER_CHANNEL);
    channel.onmessage = () => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-panel", "role-targets"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["agent-panel-role-targets"],
      });
    };
    return () => channel.close();
  }, [queryClient]);

  const workflowsQuery = useQuery({
    queryKey: ["workflows", "agent-panel", "active", entityFilter],
    queryFn: () => listWorkflows({ entity: entityFilter, includeInactive: false, limit: 24 }),
    staleTime: 60_000,
    enabled: expanded,
  });
  const activeWorkQuery = useQuery({
    queryKey: ["active-work"],
    queryFn: inspectActiveWork,
    staleTime: 10_000,
    refetchInterval: expanded ? 15_000 : false,
    enabled: expanded,
  });
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
    enabled: expanded && fionaSelected,
  });
  const profilesQuery = useQuery({
    queryKey: ["hermes-profiles"],
    queryFn: fetchHermesProfiles,
    staleTime: 60_000,
    refetchInterval: expanded ? 60_000 : false,
    refetchOnWindowFocus: "always",
    networkMode: "always",
    retry: 1,
    enabled: expanded && fionaSelected,
  });
  const agentChatQuery = useQuery({
    queryKey: ["agent-panel", "chat-receipts"],
    queryFn: () => listFionaInboxItems({ limit: 100 }),
    // Realtime pushes updates; polling is only a safety net, tightened while
    // a message is awaiting its reply.
    refetchInterval: 60_000,
    staleTime: 5_000,
    enabled: fionaSelected,
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

  const workflows = useMemo(
    () =>
      runnableWorkflows(
        workflowsQuery.data ?? [],
        rolesQuery.data ?? [],
      ),
    [rolesQuery.data, workflowsQuery.data],
  );
  const isFetching = workflowsQuery.isFetching || activeWorkQuery.isFetching || agentChatQuery.isFetching || apiQuery.isFetching || profilesQuery.isFetching || rolesQuery.isFetching;
  const error = rolesQuery.error ?? activeWorkQuery.error ?? workflowsQuery.error ?? agentChatQuery.error;
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
      (fionaSelected ? agentChatQuery.data ?? [] : [])
        .filter(isChatInboxItem)
        .map(inboxItemToChatEntry),
    [agentChatQuery.data, fionaSelected],
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
    if (!selectedRoleKey || !latestReplyAt || latestReplyAt <= lastReadAt) return;
    setLastReadAt(latestReplyAt);
    try {
      window.localStorage.setItem(
        panelRoleStorageKey(selectedRoleKey, "last-read"),
        latestReplyAt,
      );
    } catch {
      /* unread state remains correct for this mounted panel */
    }
  }, [lastReadAt, latestReplyAt, selectedRoleKey]);
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
  const {
    composerRef,
    interimTranscript,
    isListening,
    isSendingChat,
    isSpeaking,
    liveVoice,
    streamingReply,
    addTextAttachments,
    cancelActiveConversation,
    endLiveVoiceSession,
    interruptLiveVoice,
    retryMessage,
    startLiveVoiceSession,
    startVoiceDraft,
    stopActiveResponse,
    stopSpeaking,
    submitComposer,
    submitLiveVoiceTurn,
    toggleLiveVoiceMute,
  } = useAgentPanelConversation({
    selectedRoleKey,
    selectedRole,
    targetAgent,
    chatDraft,
    setChatDraft,
    setChatEntries,
    chatTurns,
    conversationContext,
    fionaSelected,
    fionaDirectLive,
    targetProfileName: targetProfile?.name ?? null,
    voiceProviders,
    voiceInputProvider,
    voiceOutputProvider,
    liveVoiceAvailable,
    liveVoiceUnavailableReason,
    speakReplies,
    notifyWorkspaceMayHaveChanged,
  });
  cancelConversationRef.current = cancelActiveConversation;
  const conversationTimeline = useMemo(
    () => [
      ...chatTurns.map((turn) => ({ kind: "turn" as const, ts: turn.ts, turn })),
      ...(historySearchOpen ? [] : inlineActions.map((event) => ({ kind: "action" as const, ts: event.createdAt, event }))),
    ].sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime()),
    [chatTurns, historySearchOpen, inlineActions],
  );
  const awaitingReply = chatTurns.some((turn) => turn.role === "user" && turn.status === "queued");
  const selectedActiveWork = selectedRoleKey
    ? activeWorkQuery.data?.[selectedRoleKey] ?? []
    : [];
  const primaryActiveWork = selectedActiveWork[0] ?? null;
  const panelAvailability =
    rolesQuery.isLoading
      ? ("loading" as const)
      : error
        ? ("error" as const)
        : !selectedRole
          ? ("empty" as const)
          : selectedRole.state === "unavailable"
            ? ("unavailable" as const)
            : primaryActiveWork?.state === "blocked" ||
                primaryActiveWork?.state === "awaiting-approval"
              ? ("blocked" as const)
              : primaryActiveWork
                ? ("working" as const)
                : ("ready" as const);

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

  useEffect(() => subscribeConversationContext(setConversationContext), []);

  useEffect(() => {
    if (!selectedRoleKey) return;
    try {
      const storage = panelStorage();
      if (!storage) return;
      persistAgentPanelHistory(
        storage,
        selectedRoleKey,
        chatEntries,
      );
      historyStorageErrorShownRef.current = false;
    } catch (historyError) {
      if (!historyStorageErrorShownRef.current) {
        historyStorageErrorShownRef.current = true;
        toastError("Local chat history could not be saved", historyError);
      }
    }
  }, [chatEntries, selectedRoleKey]);

  useEffect(() => {
    if (!selectedRoleKey) return;
    try {
      const storage = panelStorage();
      if (!storage) return;
      persistAgentPanelDraft(storage, selectedRoleKey, chatDraft);
      draftStorageErrorShownRef.current = false;
    } catch (draftError) {
      if (!draftStorageErrorShownRef.current) {
        draftStorageErrorShownRef.current = true;
        toastError("Chat draft could not be saved", draftError);
      }
    }
  }, [chatDraft, selectedRoleKey]);

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
          window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, "0");
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
        window.localStorage.setItem(
          AGENT_PANEL_COLLAPSED_KEY,
          next ? "1" : "0",
        );
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
        route: conversationContextRouteLabel(conversationContext),
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
        observedState: workflowRunActionState(result.status),
        createdAt: occurredAt,
        summary: result.current_step ?? "Workflow Run created.",
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

  async function copyMessageMarkdown(text: string) {
    try {
      await writeTextToClipboard(text);
      toast.success("Message copied as markdown");
    } catch (clipboardError) {
      toastError("Message could not be copied", clipboardError);
    }
  }

  function prepareMessageDocument(text: string, createdAt: string) {
    if (!selectedRole?.agentKey) return;
    try {
      setDocumentPreview(
        previewAgentMessageDocument({
          text,
          roleKey: selectedRole.roleKey,
          agentKey: selectedRole.agentKey,
          createdAt,
        }),
      );
    } catch (previewError) {
      toastError("Message cannot be saved as a document", previewError);
    }
  }

  async function confirmMessageDocument() {
    if (!documentPreview) return;
    setIsSavingDocument(true);
    try {
      await saveAgentMessageDocument(documentPreview, true);
      setDocumentPreview(null);
      toast.success("Message saved to Documents");
      notifyWorkspaceMayHaveChanged();
    } catch (saveError) {
      toastError("Document could not be saved", saveError);
    } finally {
      setIsSavingDocument(false);
    }
  }

  function startNewSession() {
    if (!selectedRoleKey) return;
    cancelActiveConversation();
    const now = new Date().toISOString();
    try {
      if (fionaSelected) window.localStorage.removeItem(HERMES_SESSION_KEY);
      window.localStorage.setItem(
        panelRoleStorageKey(selectedRoleKey, "cleared"),
        now,
      );
      window.localStorage.removeItem(
        panelRoleStorageKey(selectedRoleKey, "history"),
      );
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

  async function createTaskFromComposer() {
    const transcript = chatDraft.trim();
    if (!transcript || isCreatingVoiceTask) return;

    try {
      setIsCreatingVoiceTask(true);
      setPlusMenuOpen(false);
      const result = await createVoiceDraftTask({
        transcript,
        requestedBy: OPERATOR_ACTOR,
        sourceRoute: conversationContextRouteLabel(conversationContext),
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

  return (
    <AgentPanelShell
      standalone={standalone}
      width={panelWidth}
      onResizeStart={startPanelResize}
      onInteraction={markRepliesRead}
    >
      <AgentPanelHeader
        mode={standalone ? "standalone" : "docked"}
        roleTargets={roleTargets}
        selectedRole={selectedRole}
        selectedRoleKey={selectedRoleKey}
        unreadCount={unreadCount}
        isFetching={isFetching}
        availability={panelAvailability}
        onSelectRole={(roleKey) => applyRoleSelection(roleKey)}
        onRefresh={refresh}
        onEject={!standalone ? onEject : null}
        onCollapse={!standalone ? toggleCollapsed : null}
      />
      {primaryActiveWork ? (
        <AgentActiveWork item={primaryActiveWork} onOpen={navigate} />
      ) : null}

      <AgentPanelThread
        containerRef={threadRef}
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
            <p className="font-ui text-[12px] font-medium text-[var(--danger)]">Agent Panel is unavailable</p>
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
              {historySearchOpen
                ? "No past messages match this search."
                : !selectedRole
                  ? "Choose a role to begin."
                  : selectedRole.state === "unavailable"
                    ? "This role has no eligible occupant and runtime binding."
                    : `Message ${selectedRole.agentName ?? selectedRole.roleName} to get started.`}
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
                      {conversationContextRouteLabel(turn.context) ? (
                        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Context sent with this message">
                          <span className="max-w-full truncate rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--overlay-1)]">
                            {conversationContextRouteLabel(turn.context)}
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
                            onClick={() =>
                              prepareMessageDocument(turn.text ?? "", turn.ts)
                            }
                            aria-label="Save to document"
                            title="Save to document"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                          >
                            <FileText className="h-3 w-3" aria-hidden="true" />
                          </button>
                        ) : null}
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
                            onClick={() =>
                              retryMessage(
                                previousUser.text ?? "",
                                retryHistory,
                              )
                            }
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
      </AgentPanelThread>

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

      <AgentPanelComposer
        contextLabel={conversationContextRouteLabel(conversationContext)}
        onFiles={(files) => void addTextAttachments(files)}
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
                  <p className="px-3 py-1.5 font-ui text-[11px] text-[var(--overlay-1)]">No runnable workflows.</p>
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
                  onClick={() => {
                    setPlusMenuOpen(false);
                    startLiveVoiceSession();
                  }}
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
            disabled={!selectedRole || selectedRole.state !== "ready"}
            placeholder={
              selectedRole?.state === "ready"
                ? `Message ${selectedRole.agentName ?? selectedRole.roleName}…`
                : "Choose an available role…"
            }
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
            <span className="max-w-24 truncate px-1 font-ui text-[11px] text-[var(--subtext-0)]">
              {selectedRole?.agentName ?? selectedRole?.roleName ?? "No role"}
            </span>
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
                  aria-label={`Steer ${selectedRole?.agentName ?? "agent"}`}
                  title={`Send this update and steer ${selectedRole?.agentName ?? "the agent"}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={submitComposer}
                disabled={!chatDraft.trim() || isSendingChat || selectedRole?.state !== "ready"}
                aria-label="Send message"
                title="Send (Enter)"
                className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
              >
                {isSendingChat ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
      </AgentPanelComposer>
      <ConfirmDialog
        open={confirmNewSessionOpen}
        title="Start a new chat session?"
        message="This clears the conversation currently visible in the Agent Panel. Durable workspace records and receipts are not deleted."
        confirmLabel="Start new session"
        onConfirm={startNewSession}
        onCancel={() => setConfirmNewSessionOpen(false)}
      />
      <AppDialog
        open={documentPreview !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingDocument) setDocumentPreview(null);
        }}
        title="Save message to Documents?"
        description="Review the exact internal document payload before writing."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDocumentPreview(null)}
              disabled={isSavingDocument}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmMessageDocument()}
              disabled={isSavingDocument}
            >
              {isSavingDocument ? "Saving…" : "Confirm write"}
            </Button>
          </>
        }
      >
        {documentPreview ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 font-ui text-[11px]">
              <dt className="text-[var(--overlay-1)]">Title</dt>
              <dd className="text-[var(--text)]">{documentPreview.title}</dd>
              <dt className="text-[var(--overlay-1)]">Path</dt>
              <dd className="break-all font-mono text-[10px] text-[var(--subtext-0)]">
                {documentPreview.sourcePath}
              </dd>
              <dt className="text-[var(--overlay-1)]">Source</dt>
              <dd className="text-[var(--subtext-0)]">
                {documentPreview.roleKey} · {documentPreview.agentKey}
              </dd>
            </dl>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--base)] p-3 font-ui text-[11px] leading-relaxed text-[var(--subtext-0)]">
              {documentPreview.content}
            </pre>
          </div>
        ) : null}
      </AppDialog>
    </AgentPanelShell>
  );
}
