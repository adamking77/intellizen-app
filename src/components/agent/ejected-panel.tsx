/** The ejected panel's whole window: chrome, the panel, and the HUD it
 *  reduces to.
 *
 *  Ported from hermes-app `EjectedPanel.tsx`. This is a second webview with
 *  its own React tree; **everything it shows arrives from the main window**
 *  over `agent-panel:frame`, and everything it does goes back as an action.
 *  The main window owns the one session store, so a turn is always attributed
 *  to exactly one transcript no matter which window asked for it.
 *
 *  Two storages, on purpose. `localStorage` carries the shape *into* the new
 *  webview once and is cleared on read; the mode within this window's life is
 *  React state. The HUD is a gesture for getting out of the way now, not a
 *  preference about how the app opens.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { Minimize2, PanelRight } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { AgentPanel } from "@/components/layout/agent-panel";
import { useWindowDrag, WindowResizeHandles } from "@/components/layout/window-chrome";
import { emptyThread, type ProfileThread } from "@/engine/session-store";
import { joinVoiceText, useVoice } from "@/voice/use-voice";
import { Hud, type HudOpen } from "./hud";
import {
  closePanelWindow,
  leaveHudHandoff,
  panelModeReducer,
  requestAction,
  resizePanelWindow,
  sizeFor,
  takeHudHandoff,
  writePanelDetached,
  type PanelMode,
} from "./panel-window";
import { runStateOf } from "./run-state";
import { usePanelFrame } from "./use-panel-session";
import { usePanelDraft } from "./panel-draft";
import type { HermesProfile } from "@/engine/profiles";

const ICON =
  "inline-flex h-[var(--h-ctl)] w-[var(--h-ctl)] items-center justify-center rounded-[var(--r-ctl)] text-[var(--overlay-1)] transition-colors " +
  "hover:bg-[var(--surface-wash)] hover:text-[var(--text)]";

const NO_THREADS: Record<string, ProfileThread> = {};

export function EjectedPanel() {
  const frame = usePanelFrame();
  const [mode, dispatch] = useReducer(panelModeReducer, undefined, (): PanelMode => ({
    hud: takeHudHandoff(),
    open: "none",
  }));

  // Size once on open as well as at creation: a HUD restored from a previous
  // session otherwise opens at whatever the window was built at.
  const sized = useRef(false);
  useEffect(() => {
    if (sized.current) return;
    sized.current = true;
    void resizePanelWindow(sizeFor(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((event: Parameters<typeof panelModeReducer>[1]) => {
    dispatch(event);
  }, []);

  // Every shape change resizes the window, so the size and what is in it can
  // never disagree.
  useEffect(() => {
    if (!sized.current) return;
    leaveHudHandoff(mode.hud);
    void resizePanelWindow(sizeFor(mode));
  }, [mode]);

  const redock = useCallback(() => {
    // Written here too: the main window may be minimised and miss the close
    // event, and this flag is what it reads on waking.
    writePanelDetached(false);
    leaveHudHandoff(false);
    void closePanelWindow().catch(() => void getCurrentWindow().close());
  }, []);

  const dragWindow = useWindowDrag();

  const selected = frame?.selectedProfile ?? null;
  const identity = selected ? frame?.profileDirectory?.[selected] ?? null : null;
  const threads = frame?.threads ?? NO_THREADS;
  const thread = useMemo(
    () => (selected ? (threads[selected] ?? emptyThread(selected)) : null),
    [threads, selected],
  );

  if (mode.hud) {
    return (
      <HudWindow
        profile={selected}
        identity={identity}
        profiles={Object.values(frame?.profileDirectory ?? {})}
        thread={thread}
        open={mode.open}
        onOpen={(open) => setMode({ type: "open", open })}
        onGrow={() => setMode({ type: "grow" })}
        onRedock={redock}
      />
    );
  }

  return (
    <div className="relative flex h-dvh min-h-0 flex-col bg-transparent p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-plane)] bg-[var(--hud-bg)]">
        <AgentPanel mode="standalone" panelFrame={frame} onHeaderMouseDown={dragWindow} headerActions={<>
          <button type="button" onClick={() => setMode({ type: "reduce" })} aria-label="Reduce to the HUD" title="Reduce to the HUD" className={`${ICON} shrink-0`}>
            <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </button>
          <button type="button" onClick={redock} aria-label="Put the panel back in the main window" title="Redock" className={`${ICON} shrink-0`}>
            <PanelRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </>} />
      </div>
      <WindowResizeHandles />
    </div>
  );
}

/** The HUD needs a voice of its own: `useVoice` is per surface, and this one
 *  sends through the channel rather than through the store. */
function HudWindow({
  profile,
  identity,
  profiles,
  thread,
  open,
  onOpen,
  onGrow,
  onRedock,
}: {
  profile: string | null;
  identity: HermesProfile | null;
  profiles: HermesProfile[];
  thread: ProfileThread | null;
  open: HudOpen;
  onOpen: (open: HudOpen) => void;
  onGrow: () => void;
  onRedock: () => void;
}) {
  const messages = useMemo(() => thread?.transcript.messages ?? [], [thread]);
  const run = runStateOf(thread);
  const sending = run.kind === "working" || run.kind === "opening";
  const { draft, setDraft, attachments } = usePanelDraft(profile);

  const send = useCallback(
    (text: string) => {
      if (!profile) return;
      requestAction({ type: "send", profile, text, attachments: text.trim() === draft.trim() ? attachments : [] });
    },
    [profile, draft, attachments],
  );

  const voice = useVoice({
    profile,
    messages,
    sending,
    onSend: send,
    onTranscript: (heard) => setDraft((current) => joinVoiceText(current, heard)),
    bars: 12,
  });

  return (
    <Hud
      agent={identity}
      profiles={profiles}
      target={profile}
      messages={messages}
      run={run}
      voice={voice}
      open={open}
      onOpen={onOpen}
      onTarget={(name) => requestAction({ type: "select", profile: name })}
      onSend={send}
      draft={draft}
      onDraft={setDraft}
      onStop={() => profile && requestAction({ type: "stop", profile })}
      onGrow={onGrow}
      onRedock={onRedock}
      sending={sending}
      ready={Boolean(profile)}
    />
  );
}
