/** Where the panel's conversation comes from, whichever window it is in.
 *
 *  Docked, the panel reads and drives `useSessionStore` directly. Ejected, it
 *  renders the frame the main window publishes and asks the main window to
 *  act. The two shapes are the same shape on purpose, so `AgentPanel` never
 *  branches on which window it is in.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ApprovalChoice } from "@/engine/contract";
import type { SessionAttachment } from "@/engine/session";
import { emptyThread, useSessionStore, type ProfileThread } from "@/engine/session-store";
import type { ApprovalDecision, ClarifyDecision } from "@/engine/transcript";
import { isPanelWindow, onFrame, requestAction, requestFrame, type PanelFrame } from "./panel-window";

export interface PanelSession {
  selectedProfile: string | null;
  thread: ProfileThread | null;
  selectProfile: (profile: string | null) => void;
  restore: (profile: string) => Promise<void>;
  send: (profile: string, text: string, attachments?: SessionAttachment[]) => Promise<void>;
  editAndSend: (profile: string, messageId: string, text: string) => Promise<void>;
  stop: (profile: string) => Promise<void>;
  decideApproval: (
    profile: string,
    decision: ApprovalDecision,
    choice: ApprovalChoice,
  ) => Promise<void>;
  decideClarify: (
    profile: string,
    decision: ClarifyDecision,
    answers: Record<string, string[]>,
  ) => Promise<void>;
}

/** The frame the ejected window renders from. Null until the first arrives. */
function useFrame(): PanelFrame | null {
  const [frame, setFrame] = useState<PanelFrame | null>(null);
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
  return frame;
}

export function usePanelSession(): PanelSession {
  const remote = isPanelWindow();

  const frame = useFrame();
  const storeSelected = useSessionStore((s) => s.selectedProfile);
  const storeThreads = useSessionStore((s) => s.threads);
  const storeSelect = useSessionStore((s) => s.selectProfile);
  const storeSend = useSessionStore((s) => s.send);
  const storeRestore = useSessionStore((s) => s.restore);
  const storeEditAndSend = useSessionStore((s) => s.editAndSend);
  const storeStop = useSessionStore((s) => s.stop);
  const storeApproval = useSessionStore((s) => s.decideApproval);
  const storeClarify = useSessionStore((s) => s.decideClarify);

  const selectedProfile = remote ? (frame?.selectedProfile ?? null) : storeSelected;
  const threads = remote ? (frame?.threads ?? EMPTY) : storeThreads;
  const thread = useMemo(
    () => (selectedProfile ? (threads[selectedProfile] ?? emptyThread(selectedProfile)) : null),
    [threads, selectedProfile],
  );

  // Every remote act resolves immediately: the answer arrives as the next
  // frame, and a promise that waited for it would hold the composer open on
  // a message that has already been delivered.
  const selectProfile = useCallback(
    (profile: string | null) => {
      if (remote) requestAction({ type: "select", profile });
      else storeSelect(profile);
    },
    [remote, storeSelect],
  );

  const send = useCallback(
    async (profile: string, text: string, attachments: SessionAttachment[] = []) => {
      if (remote) requestAction({ type: "send", profile, text, attachments });
      else await storeSend(profile, text, attachments);
    },
    [remote, storeSend],
  );

  const restore = useCallback(
    async (profile: string) => {
      if (!remote) await storeRestore(profile);
    },
    [remote, storeRestore],
  );

  const editAndSend = useCallback(
    async (profile: string, messageId: string, text: string) => {
      if (remote) requestAction({ type: "edit", profile, messageId, text });
      else await storeEditAndSend(profile, messageId, text);
    },
    [remote, storeEditAndSend],
  );

  const stop = useCallback(
    async (profile: string) => {
      if (remote) requestAction({ type: "stop", profile });
      else await storeStop(profile);
    },
    [remote, storeStop],
  );

  const decideApproval = useCallback(
    async (profile: string, decision: ApprovalDecision, choice: ApprovalChoice) => {
      if (remote) requestAction({ type: "approve", profile, decision, choice });
      else await storeApproval(profile, decision, choice);
    },
    [remote, storeApproval],
  );

  const decideClarify = useCallback(
    async (profile: string, decision: ClarifyDecision, answers: Record<string, string[]>) => {
      if (remote) requestAction({ type: "clarify", profile, decision, answers });
      else await storeClarify(profile, decision, answers);
    },
    [remote, storeClarify],
  );

  return { selectedProfile, thread, selectProfile, restore, send, editAndSend, stop, decideApproval, decideClarify };
}

const EMPTY: Record<string, ProfileThread> = {};
