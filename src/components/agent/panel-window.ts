// The agent panel's own window: its label, its sizes, the eject state
// machine, and the event channel the two webviews share. Ported from
// hermes-app `shellState.ts` and the pure half of `useEject.ts`.
//
// The main window owns the session store. The ejected window mirrors it over
// Tauri events and asks the main window to act; it never talks to the gateway
// for a turn itself, so a turn is always attributed to one transcript.

import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { ApprovalChoice } from "@/engine/contract";
import type { ProfileThread } from "@/engine/session-store";
import type { HermesProfile } from "@/engine/profiles";
import type { ApprovalDecision, ClarifyDecision } from "@/engine/transcript";

/** The label the ejected panel's window carries; `panel_window.rs` builds it. */
export const PANEL_WINDOW = "agent-panel";

/** Remembered across launches so the app reopens how it was left. */
export const PANEL_DETACHED_KEY = "intelizen:agent-panel-detached";
/** Written by the main window just before the panel opens, read once and
 *  cleared by the panel so it can dress itself as the HUD at first paint. */
export const PANEL_HUD_HANDOFF_KEY = "intelizen:agent-panel-hud";

/** How big the window is in each shape. One table so the size the window is
 *  created at and the size the panel resizes to can never disagree. The HUD
 *  sizes include clearance for the bar's shadow (see `hud.tsx`). */
export const PANEL_SIZES = {
  panel: { w: 380, h: 620 },
  hud: { w: 468, h: 126 },
  roster: { w: 468, h: 286 },
  chat: { w: 496, h: 406 },
} as const;

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Whether this webview is the ejected panel rather than the main window. */
export function isPanelWindow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const internals = (window as unknown as Record<string, { metadata?: { currentWindow?: { label?: string } } }>)
      .__TAURI_INTERNALS__;
    return internals?.metadata?.currentWindow?.label === PANEL_WINDOW;
  } catch {
    return false;
  }
}

// ── The eject state machine (main window) ─────────────────────────────

export type EjectState = "docked" | "ejecting" | "ejected";

export type EjectEvent =
  | { type: "eject" }
  /** `open_panel` returned: the window exists. */
  | { type: "opened" }
  /** `open_panel` threw. */
  | { type: "failed" }
  /** The panel window was destroyed, by redock, close or crash. */
  | { type: "closed" }
  | { type: "redock" }
  /** A check of whether the window really exists. */
  | { type: "checked"; exists: boolean };

/** Every transition keeps the one promise that matters: the conversation
 *  lives in exactly one place at a time. A lost window brings it home; an
 *  eject that fails never leaves the docked space empty. */
export function ejectReducer(state: EjectState, event: EjectEvent): EjectState {
  switch (event.type) {
    case "eject":
      return state === "ejected" ? "ejected" : "ejecting";
    case "opened":
      return "ejected";
    case "failed":
    case "closed":
    case "redock":
      return "docked";
    case "checked":
      return event.exists ? "ejected" : "docked";
  }
}

// ── Panel or HUD (the ejected window) ─────────────────────────────────

/** Panel or HUD, and what the HUD has open above its bar. The bar never
 *  grows; the chat opens upward from it. */
export interface PanelMode {
  hud: boolean;
  open: "none" | "roster" | "chat";
}

export type PanelModeEvent =
  | { type: "reduce" }
  | { type: "grow" }
  | { type: "open"; open: PanelMode["open"] };

export function panelModeReducer(mode: PanelMode, event: PanelModeEvent): PanelMode {
  switch (event.type) {
    case "reduce":
      return { hud: true, open: "none" };
    case "grow":
      return { hud: false, open: "none" };
    case "open":
      return mode.hud ? { hud: true, open: event.open } : mode;
  }
}

export function sizeFor(mode: PanelMode): { w: number; h: number } {
  if (!mode.hud) return PANEL_SIZES.panel;
  if (mode.open === "chat") return PANEL_SIZES.chat;
  if (mode.open === "roster") return PANEL_SIZES.roster;
  return PANEL_SIZES.hud;
}

// ── The channel between the two windows ───────────────────────────────

/** What the panel renders from: the session store's data, nothing else. */
export interface PanelFrame {
  selectedProfile: string | null;
  profileDirectory: Record<string, HermesProfile>;
  threads: Record<string, ProfileThread>;
}

/** What the panel asks the main window to do. Carried in the store's own
 *  vocabulary so the two windows cannot hold two contracts. */
export type PanelAction =
  | { type: "select"; profile: string | null }
  | { type: "send"; profile: string; text: string }
  | { type: "edit"; profile: string; messageId: string; text: string }
  | { type: "openSettings" }
  | { type: "stop"; profile: string }
  | { type: "approve"; profile: string; decision: ApprovalDecision; choice: ApprovalChoice }
  | { type: "clarify"; profile: string; decision: ClarifyDecision; answers: Record<string, string[]> };

const FRAME = "agent-panel:frame";
const REQUEST = "agent-panel:request";
const ACTION = "agent-panel:action";
/** Emitted by `panel_window.rs` when the panel window is destroyed. */
export const PANEL_CLOSED_EVENT = "agent-panel:closed";

const noop: UnlistenFn = () => undefined;

function safeEmit(name: string, payload?: unknown) {
  if (!isTauri) return;
  void emit(name, payload).catch(() => {
    // A dropped frame is recoverable: the next one carries the whole state.
  });
}

function safeListen<T>(name: string, fn: (payload: T) => void): Promise<UnlistenFn> {
  if (!isTauri) return Promise.resolve(noop);
  return listen<T>(name, (e) => fn(e.payload));
}

/** Main window: publish the state the panel renders from. */
export function publishFrame(frame: PanelFrame) {
  safeEmit(FRAME, frame);
}

/** Panel window: receive it. */
export function onFrame(fn: (frame: PanelFrame) => void) {
  return safeListen<PanelFrame>(FRAME, fn);
}

/** Panel window: ask for a frame, on open. Without this the panel shows
 *  nothing until the main window's state next changes. */
export function requestFrame() {
  safeEmit(REQUEST);
}

/** Main window: answer a request with the current frame. */
export function onFrameRequest(fn: () => void) {
  return safeListen<void>(REQUEST, () => fn());
}

/** Panel window: ask the main window to act on the session. */
export function requestAction(action: PanelAction) {
  safeEmit(ACTION, action);
}

/** Main window: run what the panel asked. */
export function onAction(fn: (action: PanelAction) => void) {
  return safeListen<PanelAction>(ACTION, fn);
}

export function onPanelClosed(fn: () => void) {
  return safeListen<void>(PANEL_CLOSED_EVENT, () => fn());
}

// ── The window itself (`panel_window.rs`) ─────────────────────────────

/** Open the panel window, or focus the one already out. Resolves true when
 *  this call is what created it. */
export function openPanelWindow(size: { w: number; h: number }): Promise<boolean> {
  if (!isTauri) return Promise.resolve(false);
  return invoke<boolean>("panel_open", { size: { width: size.w, height: size.h } });
}

/** Re-dock. Closing the window is the whole of it; `PANEL_CLOSED_EVENT`
 *  follows and the shell takes the panel back. */
export function closePanelWindow(): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke<void>("panel_close");
}

/** Whether the window exists right now. A remembered flag can outlive it. */
export function panelWindowIsOpen(): Promise<boolean> {
  if (!isTauri) return Promise.resolve(false);
  return invoke<boolean>("panel_is_open").catch(() => false);
}

/** Panel to HUD and back, in place. */
export function resizePanelWindow(size: { w: number; h: number }): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke<void>("panel_resize", { size: { width: size.w, height: size.h } }).catch(
    () => undefined,
  );
}

/** Whether the panel was left ejected last time the app ran. */
export function readPanelDetached(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PANEL_DETACHED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePanelDetached(detached: boolean) {
  try {
    window.localStorage.setItem(PANEL_DETACHED_KEY, detached ? "1" : "0");
  } catch {
    /* the panel still ejects for this session */
  }
}

/** The main window leaves the shape the panel should open in. The ejected
 *  window keeps it current so a webview reload restores the same shape. */
export function leaveHudHandoff(hud: boolean) {
  try {
    if (hud) window.localStorage.setItem(PANEL_HUD_HANDOFF_KEY, "1");
    else window.localStorage.removeItem(PANEL_HUD_HANDOFF_KEY);
  } catch {
    /* the panel opens in its full shape, which is never wrong */
  }
}

export function takeHudHandoff(): boolean {
  try {
    return window.localStorage.getItem(PANEL_HUD_HANDOFF_KEY) === "1";
  } catch {
    return false;
  }
}
