/** The HUD: the agent panel reduced to a bar over the user's real work.
 *
 *  Ported from hermes-app `Hud.tsx`. **The bar never grows.** Everything
 *  opens upward from it and closes again, so what sits over another app is a
 *  strip rather than a window.
 *
 *  Two things the donor paid for and this keeps. The window is transparent
 *  and larger than the bar: `--hud-clear-*` is the shadow's own blur, measured,
 *  so the one sanctioned shadow in the system is not clipped into a visible
 *  rectangle. And the eight resize edges are direct children of the positioned
 *  root, on the *visible* perimeter — WebKit keeps a `pointer-events: none`
 *  ancestor out of hit testing even when its children opt back in.
 */

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ChevronRight, ChevronUp, Maximize2, Mic, PanelRight, Square } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { VoiceButton } from "@/voice/voice-button";
import { Waveform } from "@/voice/waveform";
import type { VoiceHandle } from "@/voice/use-voice";
import type { Message } from "@/engine/transcript";
import { cn } from "@/lib/utils";
import { isTauri } from "./panel-window";
import type { RunState } from "./run-state";
import type { HermesProfile } from "@/engine/profiles";
import { Avatar, identityColor } from "@/components/agents/avatar";

/** What the HUD has open above its bar. */
export type HudOpen = "none" | "roster" | "chat";

/** `@tauri-apps/api/window` does not export this union; the donor redeclares
 *  it for the same reason. */
type ResizeDirection =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

const CLEAR = { top: 27, side: 33, bottom: 43 };

const ICON =
  "inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[var(--text-muted)] " +
  "transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-45 disabled:hover:bg-transparent";

/** The bar's ground and the one sanctioned shadow: separation from a desktop
 *  the app does not control, not depth between two of its own planes. */
const SURFACE: CSSProperties = {
  background: "var(--mantle)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.44)",
};

function startResize(dir: ResizeDirection) {
  if (!isTauri) return;
  void getCurrentWindow()
    .startResizeDragging(dir)
    // Logged, never swallowed: a missing capability is silent otherwise, and
    // the cursor changes while nothing happens.
    .catch((error) => console.error("resize refused", dir, error));
}

function Edge({ dir, css }: { dir: ResizeDirection; css: CSSProperties }) {
  const cursor =
    dir === "North" || dir === "South"
      ? "ns-resize"
      : dir === "East" || dir === "West"
        ? "ew-resize"
        : dir === "NorthWest" || dir === "SouthEast"
          ? "nwse-resize"
          : "nesw-resize";
  return (
    <div
      aria-hidden
      style={{ position: "absolute", zIndex: 5, cursor, ...css }}
      onMouseDown={(e) => {
        e.stopPropagation();
        startResize(dir);
      }}
    />
  );
}

/** Corners are declared after sides so they win the overlap. */
function ResizeFrame() {
  const sideSpan = { left: CLEAR.side + 9, right: CLEAR.side + 9 };
  const vertSpan = { top: CLEAR.top + 9, bottom: CLEAR.bottom + 9 };
  return (
    <>
      <Edge dir="North" css={{ top: CLEAR.top, ...sideSpan, height: 5 }} />
      <Edge dir="South" css={{ bottom: CLEAR.bottom, ...sideSpan, height: 5 }} />
      <Edge dir="West" css={{ left: CLEAR.side, ...vertSpan, width: 5 }} />
      <Edge dir="East" css={{ right: CLEAR.side, ...vertSpan, width: 5 }} />
      <Edge dir="NorthWest" css={{ top: CLEAR.top, left: CLEAR.side, width: 9, height: 9 }} />
      <Edge dir="NorthEast" css={{ top: CLEAR.top, right: CLEAR.side, width: 9, height: 9 }} />
      <Edge dir="SouthWest" css={{ bottom: CLEAR.bottom, left: CLEAR.side, width: 9, height: 9 }} />
      <Edge dir="SouthEast" css={{ bottom: CLEAR.bottom, right: CLEAR.side, width: 9, height: 9 }} />
    </>
  );
}

export interface HudProps {
  agent: HermesProfile | null;
  profiles: HermesProfile[];
  target: string | null;
  messages: Message[];
  run: RunState;
  voice: VoiceHandle;
  open: HudOpen;
  onOpen: (open: HudOpen) => void;
  onTarget: (name: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Back to the full ejected panel. */
  onGrow: () => void;
  /** Back into the main window. */
  onRedock: () => void;
  sending: boolean;
  ready: boolean;
}

export function Hud({
  agent,
  profiles,
  target,
  messages,
  run,
  voice,
  open,
  onOpen,
  onTarget,
  onSend,
  onStop,
  onGrow,
  onRedock,
  sending,
  ready,
}: HudProps) {
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);

  useEffect(() => {
    const el = log.current;
    if (!el || open !== "chat") return;
    if (atBottom.current) {
      el.scrollTo({ top: el.scrollHeight });
      setBehind(false);
    } else {
      setBehind(true);
    }
  }, [messages, open]);

  const speaking = voice.mine ? "you" : voice.talking ? "agent" : null;
  const name = agent?.displayName || agent?.name || target || "Agents";
  const hue = identityColor(name, agent?.avatarColor);
  const face: HermesProfile = agent ?? {
    name: target ?? "agents",
    displayName: name,
    description: "",
    model: null,
    provider: null,
    isDefault: false,
    gatewayRunning: false,
    avatarStyle: "sphere",
  };

  // A window you can only move by one strip feels stuck, so the panel's own
  // ground drags it. Controls and the transcript's text do not — but the
  // transcript's empty ground does, and so does its scrollbar gutter.
  const drag = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea")) return;
    const transcript = target.closest<HTMLElement>("[data-hud-log]");
    if (
      transcript &&
      (target !== transcript || e.clientX < transcript.getBoundingClientRect().right - 12)
    ) {
      return;
    }
    if (!isTauri) return;
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  // The guard comes before the draft is cleared: the donor's own bug was a
  // turn typed mid-run that emptied the box and delivered nothing.
  const submit = () => {
    const text = draft.trim();
    if (!text || sending || !ready) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div
      className="relative flex h-full flex-col justify-end gap-1.5 bg-transparent"
      style={{ padding: `${CLEAR.top}px ${CLEAR.side}px ${CLEAR.bottom}px` }}
    >
      <ResizeFrame />

      {open === "roster" ? (
        <div
          onMouseDown={drag}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[22px] px-3 py-[9px]"
          style={SURFACE}
          role="listbox"
          aria-label="Agents"
        >
          {profiles.length === 0 ? (
            <span className="m-auto font-ui text-[var(--t-meta)] text-[var(--text-muted)]">No agents listed.</span>
          ) : null}
          {profiles.map((profile) => {
            const selected = profile.name === target;
            const online = profile.gatewayRunning !== false;
            return (
              <button
                key={profile.name}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onTarget(profile.name);
                  onOpen("none");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--r-row)] px-1.5 py-1 text-left outline-none",
                  "hover:bg-[var(--base)] focus-visible:bg-[var(--base)]",
                  selected && "bg-[var(--base)]",
                )}
              >
                <Avatar
                  agent={{
                    displayName: profile.displayName || profile.name,
                    avatarStyle: profile.avatarStyle,
                    avatarKind: profile.avatarKind,
                    avatarColor: profile.avatarColor,
                  }}
                  size={20}
                  image={profile.avatarImage}
                  animate={false}
                />
                <span className="min-w-0 flex-1 truncate font-ui text-[var(--t-meta)] text-[var(--text)]">
                  {profile.displayName || profile.name}
                </span>
                <span className="shrink-0 font-mono text-[var(--t-count)] text-[var(--text-muted)]">
                  {online ? profile.model ?? "ready" : "offline"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {open === "chat" ? (
        <div
          onMouseDown={drag}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px]"
          style={SURFACE}
        >
          <div
            ref={log}
            data-hud-log
            onScroll={(event) => {
              const el = event.currentTarget;
              const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 32;
              atBottom.current = near;
              if (near) setBehind(false);
            }}
            className="flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto overscroll-contain px-3 pb-2 pt-[11px]"
          >
            {messages.length === 0 ? (
              <span className="m-auto font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
                {ready ? `Ask ${name} something.` : "No agent to ask."}
              </span>
            ) : null}
            {messages.slice(-24).map((m) =>
              m.from === "you" ? (
                <div
                  key={m.id}
                  className="max-w-[82%] self-end whitespace-pre-wrap rounded-[var(--r-msg)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-[11px] py-1.5 font-ui text-[var(--t-ui)] leading-normal text-[var(--text)]"
                >
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="flex gap-2">
                  <div className="mt-0.5 shrink-0">
                    <Avatar agent={face} size={20} image={face.avatarImage} animate={false} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="t-section uppercase tracking-[0.14em] text-[var(--text-muted)]">{name}</span>
                    <div
                      className="whitespace-pre-wrap rounded-[var(--r-msg)] px-[11px] py-1.5 font-ui text-[var(--t-ui)] leading-normal text-[var(--text)]"
                      style={{ background: `color-mix(in srgb, ${hue} 12%, transparent)` }}
                    >
                      {m.text.replace(/^\s+/, "")}
                      {m.streaming ? (
                        <span
                          aria-hidden
                          className="ml-0.5 inline-block h-[13px] w-0.5 -translate-y-px bg-[var(--accent)] align-middle"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {behind ? (
            <div className="flex shrink-0 justify-center py-1">
              <button
                type="button"
                className="rounded-[var(--r-pill)] bg-[var(--hover-strong)] px-3 py-0.5 text-[var(--t-meta)] text-[var(--text)]"
                onClick={() => {
                  const el = log.current;
                  if (!el) return;
                  el.scrollTo({ top: el.scrollHeight });
                  atBottom.current = true;
                  setBehind(false);
                }}
              >
                New reply ↓
              </button>
            </div>
          ) : null}

          {voice.note ? (
            <p role="status" className="px-3 pt-1 font-ui text-[var(--t-section)] leading-snug text-[var(--bad)]">
              {voice.note}
            </p>
          ) : null}

          <HudComposer
            draft={draft}
            onDraft={setDraft}
            onSubmit={submit}
            voice={voice}
            speaking={speaking}
            name={name}
            agentColor={hue}
            sending={sending}
            ready={ready}
          />

          <div
            aria-hidden
            className="flex h-2 shrink-0 cursor-ns-resize items-center justify-center"
            onMouseDown={(e) => {
              e.stopPropagation();
              startResize("South");
            }}
          >
            <div className="h-0.5 w-8 rounded-[var(--r-pill)] bg-[var(--line-strong)]" />
          </div>
        </div>
      ) : null}

      {/* The bar. 48px, and it never grows. */}
      <div
        onMouseDown={drag}
        onDoubleClick={onRedock}
        className="flex h-12 shrink-0 cursor-default items-center gap-[9px] rounded-[var(--r-pill)] px-[18px]"
        style={SURFACE}
        data-run-state={run.kind}
      >
        <div className="flex min-w-0 flex-1 items-center gap-[9px]">
          {speaking && open === "none" ? (
            <>
              {speaking === "you" ? (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent)] text-[var(--go-fg)]">
                  <Mic className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                </span>
              ) : (
                <Avatar agent={face} size={20} image={face.avatarImage} animate={false} speaking={voice.said} />
              )}
              <div className="min-w-0 flex-1">
                <Waveform
                  color={speaking === "agent" ? hue : "var(--accent)"}
                  height={14}
                  bars={12}
                  levels={speaking === "agent" ? voice.saidLevels : voice.levels}
                />
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpen(open === "roster" ? "none" : "roster")}
                aria-label={open === "roster" ? "Close the agent list" : "Open the agent list"}
                aria-expanded={open === "roster"}
                title="Agents"
                className="flex min-w-0 items-center gap-[9px] rounded-[var(--r-row)] px-1 py-0.5 outline-none transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
              >
                <Avatar agent={face} size={20} image={face.avatarImage} animate="always" />
                <span className="truncate font-ui text-[var(--t-section)] font-light uppercase tracking-[0.14em] text-[var(--text)]">
                  {name}
                </span>
              </button>
              <HudRun run={run} agent={name} />
            </>
          )}
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center gap-0.5">
          {speaking ? (
            <button
              type="button"
              onClick={() => {
                if (voice.convo) voice.setConvo(false);
                else if (speaking === "agent") voice.interrupt();
                else void voice.dictate();
              }}
              aria-label={voice.convo ? "Stop voice chat" : speaking === "agent" ? "Stop speaking" : "Stop listening"}
              title={voice.convo ? "Stop voice chat" : "Stop"}
              className={ICON}
              style={voice.convo ? { color: "var(--bad)" } : undefined}
            >
              <Square className="h-[7px] w-[7px]" strokeWidth={0} fill="currentColor" aria-hidden />
            </button>
          ) : voice.dictationOn ? (
            <button
              type="button"
              onClick={() => void voice.dictate()}
              disabled={voice.hearing}
              aria-label={voice.hearing ? "Typing what was said" : "Speak instead of typing"}
              title={voice.hearing ? "Typing what was said…" : "Speak"}
              className={ICON}
            >
              <Mic className="h-[13px] w-[13px]" strokeWidth={1.5} aria-hidden />
            </button>
          ) : null}
          {(voice.canConverse || voice.convo) && !speaking ? (
            <VoiceButton mode="converse" voice={voice} onTranscript={() => undefined} className={ICON} />
          ) : null}
          <button
            type="button"
            onClick={() => onOpen(open === "chat" ? "none" : "chat")}
            aria-label={open === "chat" ? "Close the conversation" : "Open the conversation"}
            title={open === "chat" ? "Close" : "Open the conversation"}
            className={ICON}
          >
            <ChevronUp
              className="h-[13px] w-[13px]"
              strokeWidth={1.5}
              style={{
                transform: open === "chat" ? "rotate(180deg)" : undefined,
                transition: "transform 160ms ease",
              }}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={onGrow}
            aria-label="Back to the full panel"
            title="Back to the full panel"
            className={ICON}
          >
            <Maximize2 className="h-[13px] w-[13px]" strokeWidth={1.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRedock}
            aria-label="Put the panel back in the main window"
            title="Redock"
            className={ICON}
          >
            <PanelRight className="h-[13px] w-[13px]" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
      {/* `onStop` is the bar's only route to interrupting a turn it cannot
          see; the chat's own stop lives in the composer. */}
      {run.kind === "working" && open === "none" ? (
        <button type="button" onClick={onStop} className="sr-only">
          Stop this turn
        </button>
      ) : null}
    </div>
  );
}

/** What the run is doing, in the bar, in words. Colour is never alone. */
function HudRun({ run, agent }: { run: RunState; agent: string }) {
  if (run.kind === "idle" || run.kind === "done") return null;
  const text =
    run.kind === "opening"
      ? "opening a session…"
      : run.kind === "working"
        ? run.label
          ? `· ${run.label}`
          : "is working…"
        : run.kind === "waiting"
          ? "needs a decision"
          : `failed · ${run.reason}`;
  return (
    <span
      className={cn(
        "min-w-0 truncate font-ui text-[var(--t-meta)]",
        run.kind === "failed" ? "text-[var(--bad)]" : run.kind === "waiting" ? "text-[var(--wait)]" : "text-[var(--text-muted)]",
      )}
      title={run.kind === "failed" ? run.reason : undefined}
    >
      {run.kind === "working" && !run.label ? `${agent} ${text}` : text}
    </span>
  );
}

function HudComposer({
  draft,
  onDraft,
  onSubmit,
  voice,
  speaking,
  name,
  agentColor,
  sending,
  ready,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  voice: VoiceHandle;
  speaking: "you" | "agent" | null;
  name: string;
  agentColor: string;
  sending: boolean;
  ready: boolean;
}) {
  const row = "flex shrink-0 items-center gap-2 border-t border-[var(--hair)] bg-[var(--base)] px-3 py-2";

  if (speaking === "agent") {
    return (
      <div className={row}>
        <div className="min-w-0 flex-1">
          <Waveform color={agentColor} height={14} bars={16} levels={voice.saidLevels} />
        </div>
        <span className="font-ui text-[var(--t-section)] uppercase tracking-[0.14em] text-[var(--text-muted)]">speaking</span>
        <button type="button" onClick={voice.interrupt} aria-label="Stop" title="Stop" className={ICON}>
          <Square className="h-2 w-2" strokeWidth={0} fill="currentColor" aria-hidden />
        </button>
      </div>
    );
  }

  if (speaking === "you") {
    return (
      <div className={row}>
        <button
          type="button"
          onClick={voice.abandon}
          aria-label="Discard the recording"
          title="Discard the recording"
          className="rounded-[var(--r-pill)] px-2 py-0.5 font-ui text-[var(--t-meta)] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          Cancel
        </button>
        {voice.interim ? (
          <span className="min-w-0 flex-1 truncate font-ui text-[var(--t-ui)] text-[var(--text)]">{voice.interim}</span>
        ) : (
          <div className="min-w-0 flex-1">
            <Waveform color="var(--accent)" height={14} bars={16} levels={voice.levels} />
          </div>
        )}
        <button
          type="button"
          onClick={() => void voice.dictate()}
          aria-label="Stop listening and use what was said"
          title="Stop"
          className={cn(ICON, "text-[var(--accent)]")}
        >
          <Square className="h-2 w-2" strokeWidth={0} fill="currentColor" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className={row}>
      <input
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={sending ? "Working…" : ready ? `Message ${name}…` : "No agent to ask"}
        aria-label={`Message ${name}`}
        className="min-w-0 flex-1 bg-transparent font-ui text-[var(--t-ui)] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
      />
      {voice.dictationOn ? (
        <button
          type="button"
          onClick={() => void voice.dictate()}
          disabled={voice.hearing}
          aria-label={voice.hearing ? "Typing what was said" : "Speak instead of typing"}
          title={voice.hearing ? "Typing what was said…" : "Speak"}
          className={ICON}
        >
          <Mic className="h-[13px] w-[13px]" strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}
      {/* One slot: the conversation toggle while the box is empty, Send once
          there is something to send. */}
      {!draft.trim() && (voice.canConverse || voice.convo) ? (
        <VoiceButton mode="converse" voice={voice} onTranscript={() => undefined} />
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={sending || !ready || !draft.trim()}
          aria-label={sending ? "Working — this turn cannot be stopped from here" : "Send"}
          title="Send"
          className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--go-bg)] text-[var(--go-fg)] transition-opacity disabled:opacity-40"
        >
          <ChevronRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
        </button>
      )}
    </div>
  );
}
