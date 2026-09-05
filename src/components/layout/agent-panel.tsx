import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { open as pickFiles } from "@tauri-apps/plugin-dialog";
import { ChevronsUpDown, PanelRightClose } from "lucide-react";

import { Composer, RunStatus, type RunState } from "@/components/agent/agent-composer";
import { MaterialContext } from "@/components/agent/material-context";
import type { PaneResize } from "@/components/layout/pane-resize";
import { AgentPanelShell } from "@/components/agent/agent-panel-shell";
import { AgentTurn, UserTurn, type TurnActions } from "@/components/agent/agent-turn";
import { DecisionCard } from "@/components/agent/decision-card";
import { TargetPicker } from "@/components/agent/target-picker";
import { Avatar } from "@/components/agents/avatar";
import { Control } from "@/components/ui/control";
import { Receipt } from "@/components/ui/receipt";
import { usePanelSession } from "@/components/agent/use-panel-session";
import { usePanelDraft } from "@/components/agent/panel-draft";
import { useEngineStore } from "@/engine/engine-store";
import type { SessionUsage } from "@/engine/contract";
import { acpEngineLabel, listAcpAgents } from "@/engine/acp-registry";
import { getGatewayClient } from "@/engine/gateway";
import { defaultProfile, listProfiles, loadProfileAvatar, type HermesProfile } from "@/engine/profiles";
import { transcriptBusy, type Decision, type Message } from "@/engine/transcript";
import {
  AGENT_PANEL_COLLAPSED_KEY,
  readAgentPanelCollapsed,
} from "@/lib/agent-panel-persistence";
import { SEND_ON_ENTER_KEY, SHOW_REASONING_KEY, usePreference } from "@/lib/settings-preferences";
import { toast, toastError } from "@/lib/toast";
import { useWindowSize } from "@/lib/use-window-size";
import { PluginPanelActions } from "@/plugins/panel-actions";
import { previewAgentMessageDocument, saveAgentMessageDocument } from "@/services/agent-message-document";
import { joinVoiceText, useVoice } from "@/voice/use-voice";
import { VoiceButton } from "@/voice/voice-button";
import { RoomView } from "@/views/Room";
import { useSessionStore } from "@/engine/session-store";
import { requestAction, type PanelFrame } from "@/components/agent/panel-window";
import { loadTeams } from "@/components/agents/teams-store";
import { openTeamRoom } from "@/rooms/team-room";

const ICON_BUTTON =
  "inline-flex h-[var(--h-ctl)] w-[var(--h-ctl)] items-center justify-center rounded-[var(--r-ctl)] text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]";

function panelStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface AgentPanelProps {
  pane?: PaneResize;
  headerActions?: React.ReactNode;
  onHeaderMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  mode?: "docked" | "standalone";
  panelFrame?: PanelFrame | null;
  overlay?: boolean;
  onOverlayClose?: () => void;
  onEject?: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
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
export function AgentPanel({
  pane, headerActions, onHeaderMouseDown,
  mode = "docked",
  panelFrame,
  overlay = false,
  onOverlayClose,
  onEject,
  onCollapsedChange,
  openRequest = 0,
  toggleRequest = 0,
}: AgentPanelProps) {
  const standalone = mode === "standalone";
  const { isCramped } = useWindowSize();
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() =>
    readAgentPanelCollapsed(panelStorage()),
  );
  const [showReasoning] = usePreference(SHOW_REASONING_KEY, "1");
  const [sendOnEnter] = usePreference(SEND_ON_ENTER_KEY, "1");
  const collapsed = overlay ? false : userCollapsed ?? isCramped;

  useEffect(() => {
    if (!standalone && !overlay) onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange, standalone, overlay]);



  const { remote, frameReady, profileDirectory, selectedProfile, thread, selectProfile, restore, send, editAndSend, stop, decideApproval, decideClarify } = usePanelSession(panelFrame);
  const connection = useEngineStore((s) => s.connection);
  const engineError = useEngineStore((s) => s.error);
  const engineOpen = connection === "open";

  const profilesQuery = useQuery({
    queryKey: ["engine", "profiles"],
    queryFn: () => listProfiles(getGatewayClient()),
    enabled: engineOpen && !remote,
    staleTime: 30_000,
    retry: false,
  });
  const acpQuery = useQuery({ queryKey: ["acp", "agents"], queryFn: listAcpAgents, enabled: !remote, staleTime: 15_000 });
  const hermesProfiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const [avatarImages, setAvatarImages] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (remote) return;
    for (const candidate of hermesProfiles) {
      if (!candidate.hasAvatar || candidate.name in avatarImages) continue;
      setAvatarImages((current) => ({ ...current, [candidate.name]: null }));
      void loadProfileAvatar(getGatewayClient(), candidate)
        .then((image) => setAvatarImages((current) => ({ ...current, [candidate.name]: image })))
        .catch(() => undefined);
    }
  }, [remote, hermesProfiles, avatarImages]);
  const acpProfiles: HermesProfile[] = useMemo(
    () =>
      (acpQuery.data ?? []).map((agent) => ({
        name: `acp:${agent.id}`,
        displayName: agent.name,
        description: agent.role ?? "",
        model: agent.model ?? null,
        provider: acpEngineLabel(agent.engine),
        isDefault: false,
        gatewayRunning: true,
        avatarStyle: agent.avatarStyle === "blob" ? "blob" : "sphere",
        avatarKind: agent.avatarKind,
        avatarColor: agent.avatarColor || agent.avatar,
      })),
    [acpQuery.data],
  );
  const remoteProfiles = remote ? profileDirectory : null;
  const profiles = useMemo(
    () => remoteProfiles ? Object.values(remoteProfiles) : [
      ...hermesProfiles.map((candidate) => ({ ...candidate, avatarImage: avatarImages[candidate.name] })),
      ...acpProfiles,
    ],
    [remoteProfiles, hermesProfiles, acpProfiles, avatarImages],
  );
  const setProfileDirectory = useSessionStore((state) => state.setProfileDirectory);

  useEffect(() => {
    if (!remote) setProfileDirectory(profiles);
  }, [remote, profiles, setProfileDirectory]);


  const selectedRoomId = useSessionStore((state) => state.selectedRoomId);
  const selectRoom = useSessionStore((state) => state.selectRoom);
  const teamsQuery = useQuery({ queryKey: ["agents", "teams"], queryFn: loadTeams, staleTime: Infinity });
  const teams = teamsQuery.data ?? [];

  // The first selection is the profile Hermes marks default; nothing is
  // hard-coded. An explicit choice is never overridden afterwards.
  useEffect(() => {
    if (remote || selectedProfile || profiles.length === 0) return;
    const first = defaultProfile(hermesProfiles) ?? acpProfiles[0];
    if (first) selectProfile(first.name);
  }, [remote, hermesProfiles, acpProfiles, selectedProfile, selectProfile]);

  const profile: HermesProfile | null =
    profiles.find((p) => p.name === selectedProfile) ??
    (selectedProfile ? { name: selectedProfile, isDefault: false, model: null, provider: null, gatewayRunning: engineOpen, description: "", displayName: "", avatarStyle: "sphere" } : null);
  const agentName = profile?.displayName || profile?.name || null;
  const isAcp = selectedProfile?.startsWith("acp:") ?? false;
  const usable = useCallback((p: HermesProfile) => p.name.startsWith("acp:") || ((remote || engineOpen) && p.gatewayRunning), [remote, engineOpen]);
  const targetReady = Boolean(profile && usable(profile));

  useEffect(() => {
    if (!engineOpen || !selectedProfile || selectedProfile.startsWith("acp:")) return;
    void restore(selectedProfile).catch(() => undefined);
  }, [engineOpen, selectedProfile, restore]);

  const [picking, setPicking] = useState(false);
  const targetButton = useRef<HTMLButtonElement | null>(null);
  const closePicker = useCallback(() => {
    setPicking(false);
    window.requestAnimationFrame(() => targetButton.current?.focus());
  }, []);
  const { draft, setDraft, attachments, setAttachments } = usePanelDraft(selectedProfile);
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
    if (overlay) { onOverlayClose?.(); return; }
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
  }, [collapsed, standalone, overlay, onOverlayClose]);

  // A remount must not replay a shell toggle that the previous panel handled.
  const handledToggleRequest = useRef(toggleRequest);
  useEffect(() => {
    if (toggleRequest <= 0 || toggleRequest === handledToggleRequest.current) return;
    handledToggleRequest.current = toggleRequest;
    toggleCollapsed();
  }, [toggleCollapsed, toggleRequest]);

  const submit = (text?: string) => {
    const usingDraft = text === undefined;
    const trimmed = (text ?? draft).trim();
    const picked = usingDraft ? attachments : [];
    if ((!trimmed && picked.length === 0) || !selectedProfile || !targetReady || running) return;
    atBottom.current = true;
    send(selectedProfile, trimmed, picked).catch((error) => toastError("Could not send", error));
  };

  const attach = async () => {
    const chosen = await pickFiles({ multiple: true, directory: false });
    const paths = typeof chosen === "string" ? [chosen] : (chosen ?? []);
    setAttachments((current) => {
      const known = new Set(current.map((attachment) => attachment.path));
      return [...current, ...paths.filter((path) => !known.has(path)).map((path) => ({ path, name: path.split(/[\\/]/).pop() || path }))];
    });
    composerRef.current?.focus();
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
      onOpenSettings: () => standalone
        ? requestAction({ type: "openSettings" })
        : (() => {
            window.history.pushState({}, "", "/settings?section=providers");
            window.dispatchEvent(new PopStateEvent("popstate"));
          })(),
      onAskAgain: (prompt: string) => submit(prompt),
      onEdit: (message: Message, text: string) => {
        if (!selectedProfile) return;
        atBottom.current = true;
        editAndSend(selectedProfile, message.id, text).catch((error) => toastError("Could not send", error));
      },
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
    [targetReady, running, agentName, voice, selectedProfile, editAndSend, standalone],
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

  const placeholder = !frameReady ? "Connecting to the main window…" : isAcp && agentName
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
    return null;
  }

  if (!standalone && selectedRoomId) {
    return (
      <AgentPanelShell
        standalone={overlay}
        pane={pane}
        onInteraction={() => undefined}
      >
        <RoomView roomId={selectedRoomId} panel onClose={() => selectRoom(null)} />
      </AgentPanelShell>
    );
  }

  return (
    <AgentPanelShell
      standalone={standalone || overlay}
      pane={pane}
      onInteraction={() => undefined}
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 p-3"
        data-panel-mode={mode}
        data-engine={connection}
      >
        {/* The name is the control: it states the target every turn, so it
            is also the way to change it. */}
        <div onMouseDown={onHeaderMouseDown} className="relative flex min-h-[34px] shrink-0 items-center gap-2">
          <button
            ref={targetButton}
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={picking}
            title="Who to talk to"
            className="-ml-1 flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-[var(--r-ctl)] px-1.5 py-0.5 outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
          >
            {profile ? (
              <span data-agent-avatar className="shrink-0">
                <Avatar
                  agent={{
                    displayName: agentName ?? profile.name,
                    avatarStyle: profile.avatarStyle,
                    avatarKind: profile.avatarKind,
                    avatarColor: profile.avatarColor,
                  }}
                  size={20}
                  image={profile.avatarImage}
                  animate="always"
                />
              </span>
            ) : null}
            <span className="truncate font-ui text-[var(--t-section)] font-light uppercase tracking-[0.16em] text-[var(--text)]">
              {agentName ?? (!frameReady ? "Connecting…" : !remote && profilesQuery.isPending && engineOpen ? "Loading…" : "No profile")}
            </span>
            <ChevronsUpDown className="h-[11px] w-[11px] shrink-0 opacity-60" strokeWidth={1.6} aria-hidden />
          </button>
          {profile?.model && !headerActions ? (
            <span className="truncate font-mono text-[var(--t-count)] text-[var(--text-muted)]">{profile.model}</span>
          ) : null}
          <div className="flex-1" />
          {headerActions}
          {!standalone ? (
            <Control
              variant="quiet"
              size="icon"
              onClick={toggleCollapsed}
              aria-label="Collapse agent panel"
              title="Collapse agent panel"
              className={ICON_BUTTON}
            >
              <PanelRightClose className="h-4 w-4" strokeWidth={1.5} />
            </Control>
          ) : null}
          {picking ? (
            <TargetPicker
              profiles={profiles}
              target={selectedProfile}
              usable={usable}
              onTarget={selectProfile}
              teams={teams}
              onTeam={(team) => {
                void openTeamRoom(team, useSessionStore.getState().profileDirectory)
                  .then(selectRoom)
                  .catch((error) => toastError("Couldn't open that team", error));
              }}
              onClose={closePicker}
            />
          ) : null}
        </div>

        <MaterialContext />
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
          {messages.length === 0 ? !frameReady ? <p role="status" className="px-1 text-[var(--t-meta)] text-[var(--text-muted)]">Connecting to the main window…</p> : (
            <EmptyState
              connection={isAcp ? "open" : connection}
              engineError={isAcp ? null : engineError}
              profilesPending={!remote && !isAcp && profilesQuery.isPending && engineOpen}
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
                reading={voice.talking === m.id ? voice.said : undefined}
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
            <Control
              size="sm"
              onClick={jumpToLive}
            >
              New reply ↓
            </Control>
          </div>
        ) : null}

        {!isAcp ? <PluginPanelActions profile={selectedProfile} send={(text) => submit(text)} /> : null}

        <RunStatus run={run} agent={agentName ?? "The agent"} />

        {transcript?.notice ? (
          <Receipt className="ml-0 px-0.5 pb-1.5" verb="notice" object={transcript.notice.text} />
        ) : null}
        {transcript?.todos.length ? (
          <Receipt
            className="ml-0 px-0.5 pb-1.5"
            verb="tasks"
            object={`${transcript.todos.filter((todo) => todo.status === "completed").length}/${transcript.todos.length} complete`}
          />
        ) : null}
        {transcript?.usage ? <UsageReceipt usage={transcript.usage} /> : null}

        <Composer
          ref={composerRef}
          draft={joinVoiceText(draft, voice.interim)}
          onDraft={setDraft}
          onSend={() => submit()}
          onStop={onStop}
          onEject={onEject}
          attachments={attachments}
          onAttach={() => void attach().catch((error) => toastError("Could not attach files", error))}
          onRemoveAttachment={(path) => setAttachments((current) => current.filter((attachment) => attachment.path !== path))}
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

function UsageReceipt({ usage }: { usage: SessionUsage }) {
  const total = typeof usage.total === "number" ? usage.total : null;
  const parts = [
    total === null ? null : `${total.toLocaleString()} tokens`,
    typeof usage.input === "number" ? `${usage.input.toLocaleString()} in` : null,
    typeof usage.output === "number" ? `${usage.output.toLocaleString()} out` : null,
    typeof usage.context_percent === "number" ? `${Math.round(usage.context_percent)}% context` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <Receipt className="ml-0 px-0.5 pb-1.5" verb="used" object={parts.join(" · ")} />;
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
        <div className="rounded-[var(--r-ctl)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[11px] py-2">
          <p className="font-ui text-[var(--t-ui)] leading-normal text-[var(--bad)]">
            {failed ? "Hermes is offline." : "Hermes did not list its profiles."}
          </p>
          <p className="mt-0.5 font-ui text-[var(--t-meta)] leading-normal text-[var(--text-muted)]">
            {failed
              ? engineError ?? "The engine is not connected. Relaunch the app to start it."
              : profilesError}
          </p>
        </div>
      ) : (
        <>
          <span className="font-ui text-[var(--t-ui)] text-[var(--text)]">
            {starting
              ? "Starting Hermes…"
              : profilesPending
                ? "Loading profiles…"
                : agentName
                  ? `Ready — ${agentName} can answer.`
                  : "No profile selected."}
          </span>
          <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
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
