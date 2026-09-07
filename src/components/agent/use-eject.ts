import { roomSnapshot, runRoomAction } from "./panel-room";
import { $groupChats, $groupClarify } from "@/rooms/group-chat";
import { $groupActivity } from "@/rooms/group-activity";
import { refreshHostedRoom } from "@/rooms/hermes-hosted";
import { readApprovalMode, saveApprovalMode, type ApprovalMode } from "@/engine/approval-mode";
import { getGatewayClient } from "@/engine/gateway";
import { readSessionMode, useSessionMode } from "@/lib/session-mode";
import type { DocumentProposalDecision, DocumentProposalReview } from "@/proposals/document-review-context";
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
  onPanelClosed,
  openPanelWindow,
  panelWindowIsOpen,
  publishActionResult,
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

export function useEject(documentReview: DocumentProposalReview | null = null, decideDocumentProposal?: (decision: DocumentProposalDecision) => Promise<void>): EjectHandle {
  const sessionMode = useSessionMode();
  const documentReviewRef = useRef(documentReview);
  const decideDocumentProposalRef = useRef(decideDocumentProposal);
  documentReviewRef.current = documentReview;
  decideDocumentProposalRef.current = decideDocumentProposal;
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
      void publishFrame(currentPanelFrame(documentReviewRef.current)).catch((error) => toastError("Could not update the detached panel", error));
    };
    const stops: Array<() => void> = [];
    const roomChanged = () => { if (serving.current) frame(); };
    const roomStops = [$groupChats.listen(roomChanged), $groupClarify.listen(roomChanged), $groupActivity.listen(roomChanged)];
    const unsubscribe = useSessionStore.subscribe(() => {
      if (serving.current) frame();
    });
    void onAction((action) => { void run(action, decideDocumentProposalRef.current); }).then((un) => stops.push(un));
    return () => {
      unsubscribe();
      roomStops.forEach((stop) => stop());
      for (const stop of stops) stop();
    };
  }, []);

  // Publish once as soon as the panel is out, so it paints from real state
  // rather than waiting for the next thing to change.
  useEffect(() => {
    if (!ejected || !isTauri) return;
    void publishFrame(currentPanelFrame(documentReview)).catch((error) => toastError("Could not update the detached panel", error));
  }, [ejected, sessionMode.ready, sessionMode.mode, documentReview]);

  const selectedRoomId = useSessionStore((s) => s.selectedRoomId);
  useEffect(() => {
    if (!isTauri || !selectedRoomId) return;
    let refreshing = false;
    const refresh = () => {
      if (refreshing || $groupChats.get()[selectedRoomId]?.owner !== "hermes") return;
      refreshing = true;
      void refreshHostedRoom(selectedRoomId).catch(() => undefined).finally(() => { refreshing = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => window.clearInterval(timer);
  }, [selectedRoomId]);

  const eject = useCallback((asHud = false) => {
    dispatch({ type: "eject" });
    // Written before the window opens so it dresses itself at first paint
    // rather than flashing the full panel and then shrinking.
    leaveHudHandoff(asHud);
    void publishFrame(currentPanelFrame(documentReviewRef.current))
      .then(() => openPanelWindow(asHud ? PANEL_SIZES.hud : PANEL_SIZES.panel))
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

function currentPanelFrame(documentReview: DocumentProposalReview | null = null) {
  const state = useSessionStore.getState();
  return {
    selectedProfile: state.selectedProfile,
    profileDirectory: state.profileDirectory,
    threads: state.threads,
    room: roomSnapshot(state.selectedRoomId),
    documentReview,
    sessionMode: readSessionMode(),
  };
}

/** Run what the ejected panel asked for, against the one store that owns it. */
function actionErrorTitle(action: PanelAction) {
  if (action.type.startsWith("room-") || action.type === "select-team") return "Room action failed";
  if (action.type === "send" || action.type === "edit") return "Could not send";
  if (action.type === "stop") return "Could not stop the turn";
  if (action.type === "approve") return "Could not answer the approval";
  if (action.type === "clarify") return "Could not send the answer";
  if (action.type === "approval-mode") return "Could not update approval settings";
  if (action.type === "document-proposal") return "Could not apply the document decision";
  return "Could not update the agent panel";
}

async function run(action: PanelAction, decideDocumentProposal?: (decision: DocumentProposalDecision) => Promise<void>) {
  try {
    const result = await execute(action, decideDocumentProposal);
    await publishActionResult(action, undefined, result).catch(() => undefined);
  } catch (error) {
    await publishActionResult(action, error).catch(() => undefined);
    toastError(actionErrorTitle(action), error);
  }
}

async function execute(action: PanelAction, decideDocumentProposal?: (decision: DocumentProposalDecision) => Promise<void>): Promise<ApprovalMode | undefined> {
  if (action.type.startsWith("room-") || action.type === "select-team") {
    await runRoomAction(action as Parameters<typeof runRoomAction>[0]);
    return;
  }
  const s = useSessionStore.getState();
  switch (action.type) {
    case "document-proposal":
      if (!decideDocumentProposal) throw new Error("The document review is no longer open.");
      await decideDocumentProposal(action.decision);
      return;
    case "select":
      s.selectProfile(action.profile);
      return;
    case "send":
      await s.send(action.profile, action.text, action.attachments, action.context);
      return;
    case "edit":
      await s.editAndSend(action.profile, action.messageId, action.text);
      return;
    case "openSettings":
      window.history.pushState({}, "", "/settings?section=providers");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    case "stop":
      await s.stop(action.profile);
      return;
    case "approve":
      await s.decideApproval(action.profile, action.decision, action.choice);
      return;
    case "clarify":
      await s.decideClarify(action.profile, action.decision, action.answers);
      return;
    case "approval-mode": {
      if (action.profile.startsWith("acp:") || !s.profileDirectory[action.profile] || s.selectedProfile !== action.profile || (s.threads[action.profile]?.sessionId ?? null) !== action.sessionId) {
        throw new Error("The selected agent or session changed. Open approval settings again.");
      }
      const client = getGatewayClient();
      return action.mode
        ? saveApprovalMode(client, action.profile, action.sessionId, action.mode)
        : readApprovalMode(client, action.profile, action.sessionId);
    }
  }
}
