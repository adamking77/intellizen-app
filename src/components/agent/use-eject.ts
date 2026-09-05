/** The main window's half of ejecting.
 *
 *  Ported from hermes-app `useEject.ts`. It runs the state machine in
 *  `panel-window.ts`, opens and closes the window through `panel_window.rs`,
 *  and — while the panel is out — serves it the session state and runs what it
 *  asks for. The ejected window never talks to the gateway itself, so a turn
 *  is always attributed to exactly one transcript.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

import { useSessionStore } from "@/engine/session-store";
import { toastError } from "@/lib/toast";
import { requestAgentPanelOpen } from "@/lib/agent-panel-persistence";
import {
  closePanelWindow,
  ejectReducer,
  isTauri,
  leaveHudHandoff,
  onAction,
  onFrameRequest,
  onPanelClosed,
  openPanelWindow,
  panelWindowIsOpen,
  publishFrame,
  readPanelDetached,
  writePanelDetached,
  PANEL_SIZES,
  type PanelAction,
} from "./panel-window";

export interface EjectHandle {
  ejected: boolean;
  /** True from the click until the window exists, so the button cannot be
   *  pressed twice into two windows. */
  busy: boolean;
  /** `asHud` opens straight into the reduced bar. */
  eject: (asHud?: boolean) => void;
  redock: () => void;
}

export function useEject(): EjectHandle {
  // A remembered flag is a hint, not the truth: the check below settles it.
  const [state, dispatch] = useReducer(ejectReducer, undefined, () =>
    isTauri && readPanelDetached() ? "ejected" : "docked",
  );
  const ejected = state === "ejected";

  useEffect(() => {
    writePanelDetached(ejected);
  }, [ejected]);

  const wasEjected = useRef(ejected);
  useEffect(() => {
    if (wasEjected.current && !ejected) {
      // Let the shell finish observing the docked state before asking it to
      // reveal the conversation; otherwise its old listener may redock twice.
      queueMicrotask(requestAgentPanelOpen);
    }
    wasEjected.current = ejected;
  }, [ejected]);

  // The app relaunched with the flag set, or the window died without its
  // event reaching us. Ask the window list, which cannot be stale.
  useEffect(() => {
    if (!isTauri) return;
    let live = true;
    const check = () => {
      void panelWindowIsOpen().then((exists) => {
        if (live) dispatch({ type: "checked", exists });
      });
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      live = false;
      window.removeEventListener("focus", check);
    };
  }, []);

  // The window was destroyed — re-dock, ⌘W or a crash. All three bring the
  // conversation home, which is the one promise this machine keeps.
  useEffect(() => {
    if (!isTauri) return;
    let stop: (() => void) | undefined;
    void onPanelClosed(() => dispatch({ type: "closed" })).then((un) => {
      stop = un;
    });
    return () => stop?.();
  }, []);

  // Serve the panel. Subscribing to the whole store is right here: the frame
  // is the whole store, and this component renders nothing.
  const serving = useRef(false);
  serving.current = ejected;
  useEffect(() => {
    if (!isTauri) return;
    const frame = () => {
      const s = useSessionStore.getState();
      publishFrame({ selectedProfile: s.selectedProfile, profileDirectory: s.profileDirectory, threads: s.threads });
    };
    const stops: Array<() => void> = [];
    const unsubscribe = useSessionStore.subscribe(() => {
      if (serving.current) frame();
    });
    void onFrameRequest(frame).then((un) => stops.push(un));
    void onAction((action) => run(action)).then((un) => stops.push(un));
    return () => {
      unsubscribe();
      for (const stop of stops) stop();
    };
  }, []);

  // Publish once as soon as the panel is out, so it paints from real state
  // rather than waiting for the next thing to change.
  useEffect(() => {
    if (!ejected || !isTauri) return;
    const s = useSessionStore.getState();
    publishFrame({ selectedProfile: s.selectedProfile, profileDirectory: s.profileDirectory, threads: s.threads });
  }, [ejected]);

  const eject = useCallback((asHud = false) => {
    dispatch({ type: "eject" });
    // Written before the window opens so it dresses itself at first paint
    // rather than flashing the full panel and then shrinking.
    leaveHudHandoff(asHud);
    void openPanelWindow(asHud ? PANEL_SIZES.hud : PANEL_SIZES.panel)
      .then(() => dispatch({ type: "opened" }))
      .catch((error) => {
        dispatch({ type: "failed" });
        toastError("Could not eject the agent panel", error);
      });
  }, []);

  const redock = useCallback(() => {
    dispatch({ type: "redock" });
    void closePanelWindow().catch((error) => toastError("Could not re-dock the panel", error));
  }, []);

  return { ejected, busy: state === "ejecting", eject, redock };
}

/** Run what the ejected panel asked for, against the one store that owns it. */
function run(action: PanelAction) {
  const s = useSessionStore.getState();
  switch (action.type) {
    case "select":
      s.selectProfile(action.profile);
      return;
    case "send":
      s.send(action.profile, action.text, action.attachments).catch((error) => toastError("Could not send", error));
      return;
    case "edit":
      s.editAndSend(action.profile, action.messageId, action.text).catch((error) => toastError("Could not send", error));
      return;
    case "openSettings":
      window.history.pushState({}, "", "/settings?section=providers");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    case "stop":
      s.stop(action.profile).catch((error) => toastError("Could not stop the turn", error));
      return;
    case "approve":
      s.decideApproval(action.profile, action.decision, action.choice).catch((error) =>
        toastError("Could not answer the approval", error),
      );
      return;
    case "clarify":
      s.decideClarify(action.profile, action.decision, action.answers).catch((error) =>
        toastError("Could not send the answer", error),
      );
  }
}
