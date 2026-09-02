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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Minimize2, PanelRight } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { AgentPanel } from "@/components/layout/agent-panel";
import { useWindowDrag, WindowResizeHandles } from "@/components/layout/window-chrome";
import { emptyThread, type ProfileThread } from "@/engine/session-store";
import { useVoice } from "@/voice/use-voice";
import { Hud, type HudOpen } from "./hud";
import {
  closePanelWindow,
  onFrame,
  panelModeReducer,
  requestAction,
  requestFrame,
  resizePanelWindow,
  sizeFor,
  takeHudHandoff,
  writePanelDetached,
  type PanelFrame,
  type PanelMode,
} from "./panel-window";
import { runStateOf } from "./run-state";

const ICON =
  "inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors " +
  "hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]";

const NO_THREADS: Record<string, ProfileThread> = {};

export function EjectedPanel() {
  const [frame, setFrame] = useState<PanelFrame | null>(null);
  const [mode, dispatch] = useReducer(panelModeReducer, undefined, (): PanelMode => ({
    hud: takeHudHandoff(),
    open: "none",
  }));

  // Subscribe, then ask — and ask again shortly after, because this webview
  // can be listening before the main window is.
  useEffect(() => {
    let stop: (() => void) | undefined;
    void onFrame(setFrame).then((un) => {
      stop = un;
    });
    requestFrame();
    const retry = window.setTimeout(requestFrame, 250);
    return () => {
      window.clearTimeout(retry);
      stop?.();
    };
  }, []);

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
    void resizePanelWindow(sizeFor(mode));
  }, [mode]);

  const redock = useCallback(() => {
    // Written here too: the main window may be minimised and miss the close
    // event, and this flag is what it reads on waking.
    writePanelDetached(false);
    void closePanelWindow().catch(() => void getCurrentWindow().close());
  }, []);

  const dragWindow = useWindowDrag();

  const selected = frame?.selectedProfile ?? null;
  const threads = frame?.threads ?? NO_THREADS;
  const thread = useMemo(
    () => (selected ? (threads[selected] ?? emptyThread(selected)) : null),
    [threads, selected],
  );

  if (mode.hud) {
    return (
      <HudWindow
        profile={selected}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)]">
        {/* Frameless floating window: this strip is its title bar. There is
            no close button — Redock is the way home. */}
        <div
          onMouseDown={dragWindow}
          className="flex h-[30px] shrink-0 cursor-default items-center gap-2 border-b border-[var(--border)] pl-3 pr-1.5"
        >
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--overlay-1)]">
            Agent Panel
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setMode({ type: "reduce" })}
            aria-label="Reduce to the HUD"
            title="Reduce to the HUD"
            className={ICON}
          >
            <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={redock}
            aria-label="Put the panel back in the main window"
            title="Redock"
            className={ICON}
          >
            <PanelRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <AgentPanel mode="standalone" />
        </div>
      </div>
      <WindowResizeHandles />
    </div>
  );
}

/** The HUD needs a voice of its own: `useVoice` is per surface, and this one
 *  sends through the channel rather than through the store. */
function HudWindow({
  profile,
  thread,
  open,
  onOpen,
  onGrow,
  onRedock,
}: {
  profile: string | null;
  thread: ProfileThread | null;
  open: HudOpen;
  onOpen: (open: HudOpen) => void;
  onGrow: () => void;
  onRedock: () => void;
}) {
  const messages = useMemo(() => thread?.transcript.messages ?? [], [thread]);
  const run = runStateOf(thread);
  const sending = run.kind === "working" || run.kind === "opening";

  const send = useCallback(
    (text: string) => {
      if (!profile) return;
      requestAction({ type: "send", profile, text });
    },
    [profile],
  );

  // A transcript landing in a field nobody can see vanishes, so from the
  // collapsed bar a dictated sentence is sent rather than typed.
  const [pendingDraft, setPendingDraft] = useState("");
  const voice = useVoice({
    profile,
    messages,
    sending,
    onSend: send,
    onTranscript: (heard) => (open === "chat" ? setPendingDraft(heard) : send(heard)),
    bars: 12,
  });
  // ponytail: the chat's input owns its own draft, so a dictated sentence
  // reaches it as a send rather than as text. Lift the draft into `Hud` when
  // dictation-into-the-HUD-composer is asked for.
  useEffect(() => {
    if (pendingDraft) {
      send(pendingDraft);
      setPendingDraft("");
    }
  }, [pendingDraft, send]);

  return (
    <Hud
      agent={profile}
      messages={messages}
      run={run}
      voice={voice}
      open={open}
      onOpen={onOpen}
      onSend={send}
      onStop={() => profile && requestAction({ type: "stop", profile })}
      onGrow={onGrow}
      onRedock={onRedock}
      sending={sending}
      ready={Boolean(profile)}
    />
  );
}
