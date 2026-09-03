import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, PanelRightClose, PanelRightOpen } from "lucide-react";

import { Composer, RunStatus, type RunState } from "@/components/agent/agent-composer";
import { AgentPanelShell } from "@/components/agent/agent-panel-shell";
import { AgentTurn, UserTurn, type TurnActions } from "@/components/agent/agent-turn";
import { DecisionCard } from "@/components/agent/decision-card";
import { TargetPicker } from "@/components/agent/target-picker";
import { usePanelSession } from "@/components/agent/use-panel-session";
import {
  AGENT_PANEL_MAX_WIDTH,
  AGENT_PANEL_MIN_WIDTH,
  useAgentPanelResize,
} from "@/components/agent/use-agent-panel-resize";
import { useEngineStore } from "@/engine/engine-store";
import { ACP_ENGINE_LABEL, listAcpAgents } from "@/engine/acp-registry";
import { getGatewayClient } from "@/engine/gateway";
import { defaultProfile, listProfiles, type HermesProfile } from "@/engine/profiles";
import { transcriptBusy, type Decision, type Message } from "@/engine/transcript";
import {
  AGENT_PANEL_COLLAPSED_KEY,
  AGENT_PANEL_WIDTH_KEY,
  readAgentPanelCollapsed,
} from "@/lib/agent-panel-persistence";
import { SEND_ON_ENTER_KEY, SHOW_REASONING_KEY, usePreference } from "@/lib/settings-preferences";
import { toast, toastError } from "@/lib/toast";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";
import { PluginPanelActions } from "@/plugins/panel-actions";
import { previewAgentMessageDocument, saveAgentMessageDocument } from "@/services/agent-message-document";
import { joinVoiceText, useVoice } from "@/voice/use-voice";
import { VoiceButton } from "@/voice/voice-button";
import { RoomView } from "@/views/Room";
import { useSessionStore } from "@/engine/session-store";

const ICON_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]";

function panelStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface AgentPanelProps {
  mode?: "docked" | "standalone";
  onEject?: () => void;
  openRequest?: number;
  toggleRequest?: number;
}

// Permissions stated as a word, the donor's wording ("Ask first").
const PERMISSION_WORD = {
  manual: "Ask first",
  smart: "Ask when unsure",
  off: "Never ask",
} as const;

/** The conversation with a Hermes profile, and the controls for it. The
 *  donor's `AgentPanel` restricted to one turn through the gateway and its
 *  decisions: a target picker on the name, the thread, run status directly
 *  above the composer, the composer. */
export function AgentPanel({ mode = "docked", onEject, openRequest = 0, toggleRequest = 0 }: AgentPanelProps) {
  const standalone = mode === "standalone";
  const { isCramped } = useWindowSize();
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() =>
    readAgentPanelCollapsed(panelStorage()),
  );
  const [showReasoning] = usePreference(SHOW_REASONING_KEY, "1");
  const [sendOnEnter] = usePreference(SEND_ON_ENTER_KEY, "1");
  const collapsed = userCollapsed ?? isCramped;
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(AGENT_PANEL_WIDTH_KEY));
      return Number.isFinite(stored) && stored >= AGENT_PANEL_MIN_WIDTH
        ? Math.min(stored, AGENT_PANEL_MAX_WIDTH)
        : 336;
    } catch {
      return 336;
    }
  });
  const startPanelResize = useAgentPanelResize(setPanelWidth);

  const connection = useEngineStore((s) => s.connection);
  const engineError = useEngineStore((s) => s.error);
  const engineOpen = connection === "open";

  const profilesQuery = useQuery({
    queryKey: ["engine", "profiles"],
    queryFn: () => listProfiles(getGatewayClient()),
    enabled: engineOpen,
    staleTime: 30_000,
    retry: false,
  });
  const acpQuery = useQuery({ queryKey: ["acp", "agents"], queryFn: listAcpAgents, staleTime: 15_000 });
  const hermesProfiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const acpProfiles: HermesProfile[] = useMemo(
    () =>
      (acpQuery.data ?? []).map((agent) => ({
        name: `acp:${agent.id}`,
        displayName: agent.name,
        description: agent.role ?? "",
        model: agent.model ?? null,
        provider: ACP_ENGINE_LABEL[agent.engine],
        isDefault: false,
        gatewayRunning: true,
      })),
    [acpQuery.data],
  );
  const profiles = useMemo(() => [...hermesProfiles, ...acpProfiles], [hermesProfiles, acpProfiles]);

  const { selectedProfile, thread, selectProfile, send, stop, decideApproval, decideClarify } =
    usePanelSession();
  const selectedRoomId = useSessionStore((state) => state.selectedRoomId);
  const selectRoom = useSessionStore((state) => state.selectRoom);

  // The first selection is the profile Hermes marks default; nothing is
  // hard-coded. An explicit choice is never overridden afterwards.
  useEffect(() => {
    if (selectedProfile || profiles.length === 0) return;
    const first = defaultProfile(hermesProfiles) ?? acpProfiles[0];
    if (first) selectProfile(first.name);
  }, [hermesProfiles, acpProfiles, selectedProfile, selectProfile]);

  const profile: HermesProfile | null =
    profiles.find((p) => p.name === selectedProfile) ??
    (selectedProfile ? { name: selectedProfile, isDefault: false, model: null, provider: null, gatewayRunning: engineOpen, description: "", displayName: "" } : null);
  const agentName = profile?.displayName || profile?.name || null;
  const isAcp = selectedProfile?.startsWith("acp:") ?? false;
  const usable = useCallback((p: HermesProfile) => p.name.startsWith("acp:") || (engineOpen && p.gatewayRunning), [engineOpen]);
  const targetReady = Boolean(profile && usable(profile));

  const [picking, setPicking] = useState(false);
  const closePicker = useCallback(() => setPicking(false), []);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const focusComposerWhenOpen = useRef(false);
  const log = useRef<HTMLDivElement | null>(null);

  // A relative stamp must not freeze: re-render once a minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const transcript = thread?.transcript ?? null;
  const messages = useMemo(() => transcript?.messages ?? [], [transcript]);
  const pending = transcript?.pending ?? [];
  const running = transcript ? transcriptBusy(transcript) : false;

  // Follow the live edge unless the reader has left it; offer the way back.
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);
  const jumpToLive = () => {
    const el = log.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
    atBottom.current = true;
    setBehind(false);
  };
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    if (atBottom.current) {
      el.scrollTo({ top: el.scrollHeight });
      setBehind(false);
    } else {
      setBehind(true);
    }
  }, [messages, pending.length]);

  const open = useCallback(() => {
    focusComposerWhenOpen.current = true;
    if (!standalone) {
      setUserCollapsed(false);
      try {
        window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, "0");
      } catch {
        /* the panel still opens for this session */
      }
    }
    composerRef.current?.focus();
  }, [standalone]);

  useEffect(() => {
    if (collapsed || !focusComposerWhenOpen.current || !composerRef.current) return;
    composerRef.current.focus();
    focusComposerWhenOpen.current = false;
  }, [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (openRequest > 0) open();
  }, [open, openRequest]);

  const toggleCollapsed = useCallback(() => {
    if (standalone) return;
    setUserCollapsed(() => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [collapsed, standalone]);

  const handledToggleRequest = useRef(0);
  useEffect(() => {
    if (toggleRequest <= 0 || toggleRequest === handledToggleRequest.current) return;
    handledToggleRequest.current = toggleRequest;
    toggleCollapsed();
  }, [toggleCollapsed, toggleRequest]);

  const submit = (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || !selectedProfile || !targetReady || running) return;
    setDraft("");
    atBottom.current = true;
    send(selectedProfile, trimmed).catch((error) => toastError("Could not send", error));
  };

  const onStop = () => {
    if (!selectedProfile) return;
    stop(selectedProfile).catch((error) => toastError("Could not stop the turn", error));
  };

  const voice = useVoice({
    profile: selectedProfile,
    messages,
    sending: running,
    onSend: (text) => submit(text),
    onTranscript: (text) => setDraft((current) => current.trim() ? `${current.replace(/\s+$/, "")} ${text}` : text),
  });

  const turnActions: TurnActions = useMemo(
    () => ({
      canSend: targetReady && !running,
      onRead: (message: Message) => void voice.readAloud(message),
      onStopReading: voice.interrupt,
      onAskAgain: (prompt: string) => submit(prompt),
      onEdit: (text: string) => submit(text),
      onDocument: (message: Message) => {
        const preview = previewAgentMessageDocument({
          text: message.text,
          roleKey: "agent-panel",
          agentKey: agentName ?? message.from,
          createdAt: new Date(message.at ?? Date.now()).toISOString(),
        });
        void saveAgentMessageDocument(preview, true)
          .then(() => toast.success("Saved as a document", { description: preview.title }))
          .catch((error) => toastError("Could not open this reply as a document", error));
      },
    }),
    // submit accepts explicit text for every action, so its changing draft
    // closure is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetReady, running, agentName, voice],
  );

  const run: RunState = useMemo(() => {
    if (!transcript) return { kind: "idle" };
    if (thread?.opening) return { kind: "opening" };
    if (pending.length > 0) return { kind: "waiting" };
    if (running) return { kind: "working", label: transcript.status };
    if (transcript.lastTurn) {
      return transcript.lastTurn.ok
        ? { kind: "done", outcome: transcript.lastTurn }
        : { kind: "failed", reason: messages[messages.length - 1]?.failed ?? "the turn failed" };
    }
    return { kind: "idle" };
  }, [transcript, thread?.opening, pending.length, running, messages]);

  const placeholder = isAcp && agentName
    ? `Message ${agentName}…  ↵ to send`
    : !engineOpen
    ? connection === "connecting" || (connection === "idle" && !engineError)
      ? "Starting Hermes…"
      : "Hermes is offline"
    : profilesQuery.isPending
      ? "Loading profiles…"
      : agentName
        ? `Message ${agentName}…  ↵ to send`
        : "Choose a profile";

  const decisionsFor = (messageId: string): Decision[] =>
    pending.filter((d) => d.messageId === messageId);

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
          className={cn(ICON_BUTTON, "h-8 w-8")}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  if (!standalone && selectedRoomId) {
    return (
      <AgentPanelShell
        standalone={false}
        width={panelWidth}
        onResizeStart={startPanelResize}
        onInteraction={() => undefined}
      >
        <RoomView roomId={selectedRoomId} panel onClose={() => selectRoom(null)} />
      </AgentPanelShell>
    );
  }

  return (
    <AgentPanelShell
      standalone={standalone}
      width={panelWidth}
      onResizeStart={startPanelResize}
      onInteraction={() => undefined}
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 p-3"
        data-panel-mode={mode}
        data-engine={connection}
      >
        {/* The name is the control: it states the target every turn, so it
            is also the way to change it. */}
        <div className="relative flex h-[34px] shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={picking}
            title="Who to talk to"
            className="-ml-1 flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            <span className="truncate font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text)]">
              {agentName ?? (profilesQuery.isPending && engineOpen ? "Loading…" : "No profile")}
            </span>
            <ChevronsUpDown className="h-[11px] w-[11px] shrink-0 opacity-60" strokeWidth={1.6} aria-hidden />
          </button>
          {profile?.model ? (
            <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">{profile.model}</span>
          ) : null}
          <div className="flex-1" />
          {!standalone ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse agent panel"
              title="Collapse agent panel"
              className={ICON_BUTTON}
            >
              <PanelRightClose className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : null}
          {picking ? (
            <TargetPicker
              profiles={profiles}
              target={selectedProfile}
              usable={usable}
              onTarget={selectProfile}
              onClose={closePicker}
            />
          ) : null}
        </div>

        <div
          ref={log}
          onScroll={(e) => {
            const el = e.currentTarget;
            const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 32;
            atBottom.current = near;
            if (near) setBehind(false);
          }}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain pt-1"
        >
          {messages.length === 0 ? (
            <EmptyState
              connection={isAcp ? "open" : connection}
              engineError={isAcp ? null : engineError}
              profilesPending={!isAcp && profilesQuery.isPending && engineOpen}
              profilesError={!isAcp && profilesQuery.error ? String((profilesQuery.error as Error).message ?? profilesQuery.error) : null}
              agentName={agentName}
            />
          ) : null}
          {messages.map((m) =>
            m.from === "you" ? (
              <UserTurn key={m.id} message={m} now={now} actions={turnActions} />
            ) : (
              <AgentTurn
                key={m.id}
                message={m}
                profile={profile}
                now={now}
                onRetry={(prompt) => submit(prompt)}
                actions={turnActions}
                reading={voice.talking === m.id}
                showReasoning={showReasoning !== "0"}
              >
                {decisionsFor(m.id).map((decision) => (
                  <DecisionCard
                    key={decision.requestId}
                    decision={decision}
                    asker={agentName ?? m.from}
                    busy={thread?.deciding === decision.requestId}
                    onApprove={(d, choice) => {
                      if (!selectedProfile) return;
                      decideApproval(selectedProfile, d, choice).catch((error) =>
                        toastError("Could not answer the approval", error),
                      );
                    }}
                    onClarify={(d, answers) => {
                      if (!selectedProfile) return;
                      decideClarify(selectedProfile, d, answers).catch((error) =>
                        toastError("Could not send the answer", error),
                      );
                    }}
                  />
                ))}
              </AgentTurn>
            ),
          )}
        </div>

        {behind ? (
          <div className="flex shrink-0 items-center justify-center pb-1.5">
            <button
              type="button"
              onClick={jumpToLive}
              className="rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-0.5 font-ui text-[12px] text-[var(--text)]"
            >
              New reply ↓
            </button>
          </div>
        ) : null}

        {!isAcp ? <PluginPanelActions profile={selectedProfile} send={(text) => submit(text)} /> : null}

        <RunStatus run={run} agent={agentName ?? "The agent"} />

        <Composer
          ref={composerRef}
          draft={joinVoiceText(draft, voice.interim)}
          onDraft={setDraft}
          onSend={() => submit()}
          onStop={onStop}
          onEject={onEject}
          placeholder={placeholder}
          ready={targetReady}
          running={running}
          agent={agentName}
          permission={transcript?.approvalMode ? PERMISSION_WORD[transcript.approvalMode] : null}
          note={voice.note}
          dictating={voice.mine || voice.hearing}
          dictate={<VoiceButton mode="dictate" voice={voice} onTranscript={() => undefined} />}
          converse={<VoiceButton mode="converse" voice={voice} onTranscript={() => undefined} />}
          sendOnEnter={sendOnEnter !== "0"}
        />
      </div>
    </AgentPanelShell>
  );
}

/** The panel's resting state, at the foot of the log next to the composer
 *  it is about. What is true right now, at interface size: a failure must
 *  look different from empty. */
function EmptyState({
  connection,
  engineError,
  profilesPending,
  profilesError,
  agentName,
}: {
  connection: string;
  engineError: string | null;
  profilesPending: boolean;
  profilesError: string | null;
  agentName: string | null;
}) {
  const open = connection === "open";
  const starting = !open && (connection === "connecting" || (connection === "idle" && !engineError));
  const failed = !open && !starting;
  const state = failed ? "error" : starting || profilesPending ? "loading" : profilesError ? "error" : "empty";
  return (
    <div className="mt-auto flex flex-col gap-1.5 px-0.5 pb-2.5" data-panel-state={state}>
      {failed || profilesError ? (
        <div className="rounded-[10px] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[11px] py-2">
          <p className="font-ui text-[13px] leading-normal text-[var(--bad)]">
            {failed ? "Hermes is offline." : "Hermes did not list its profiles."}
          </p>
          <p className="mt-0.5 font-ui text-[12px] leading-normal text-[var(--text-muted)]">
            {failed
              ? engineError ?? "The engine is not connected. Relaunch the app to start it."
              : profilesError}
          </p>
        </div>
      ) : (
        <>
          <span className="font-ui text-[13px] text-[var(--text)]">
            {starting
              ? "Starting Hermes…"
              : profilesPending
                ? "Loading profiles…"
                : agentName
                  ? `Ready — ${agentName} can answer.`
                  : "No profile selected."}
          </span>
          <span className="font-ui text-[12px] text-[var(--text-muted)]">
            {starting
              ? "The engine is starting. This takes a few seconds."
              : profilesPending
                ? "Asking the gateway which profiles it serves."
                : agentName
                  ? "Type below to start."
                  : "Pick one from the name above."}
          </span>
        </>
      )}
    </div>
  );
}
