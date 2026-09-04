// One live session and transcript per Hermes profile, for this app run.
// In memory only: Hermes keeps the durable history.

import { create } from "zustand";

import {
  createAcpSession,
  interruptAcpSession,
  onAcpEvent,
  respondAcpApproval,
  submitAcpPrompt,
} from "./acp-session";
import type { ApprovalChoice, GatewayClientLike } from "./contract";
import {
  answerClarify,
  approvalSummary,
  clarifySummary,
  respondApproval,
} from "./decisions";
import { getGatewayClient } from "./gateway";
import { JsonRpcGatewayError, type GatewayEvent } from "./json-rpc-gateway";
import type { HermesProfile } from "./profiles";
import {
  acpAttachmentPrompt,
  attachmentPrompt,
  createSessionHandle,
  interruptSession,
  isSessionNotFound,
  resumeSession,
  sessionEventsSince,
  sessionHistory,
  SESSION_NOT_FOUND,
  submitPrompt,
  type SessionAttachment,
} from "./session";
import {
  clearSessionPointer,
  readSessionPointer,
  transcriptFromHistory,
  writeSessionPointer,
} from "./session-continuity";
import {
  applyTranscriptAction,
  createTranscript,
  reduceTranscript,
  transcriptBusy,
  type ApprovalDecision,
  type ClarifyDecision,
  type TranscriptState,
} from "./transcript";

export interface ProfileThread {
  profile: string;
  sessionId: string | null;
  storedSessionId: string | null;
  transcript: TranscriptState;
  /** A session is being created, or a prompt is on its way to the gateway. */
  opening: boolean;
  /** A decision answer is in flight. */
  deciding: string | null;
  error: string | null;
  /** Hermes continuity has been checked for this app run. */
  restored: boolean;
}

export interface SessionStoreState {
  selectedProfile: string | null;
  selectedRoomId: string | null;
  profileDirectory: Record<string, HermesProfile>;
  threads: Record<string, ProfileThread>;
  setProfileDirectory: (profiles: HermesProfile[]) => void;
  selectProfile: (profile: string | null) => void;
  selectRoom: (roomId: string | null) => void;
  /** Make sure a live session exists for the profile; returns its id. */
  ensureSession: (profile: string) => Promise<string>;
  /** Reopen the last Hermes-owned session for a profile, if one exists. */
  restore: (profile: string) => Promise<void>;
  /** Append the person's turn and submit it. Rejects when nothing was sent. */
  send: (profile: string, text: string, attachments?: SessionAttachment[]) => Promise<void>;
  /** Remove this visible turn and everything after it, then ask the edit. */
  editAndSend: (profile: string, messageId: string, text: string) => Promise<void>;
  /** Interrupt the running turn. */
  stop: (profile: string) => Promise<void>;
  decideApproval: (profile: string, decision: ApprovalDecision, choice: ApprovalChoice) => Promise<void>;
  decideClarify: (profile: string, decision: ClarifyDecision, answers: Record<string, string[]>) => Promise<void>;
  /** Route one gateway event to the thread whose session emitted it. */
  applyEvent: (event: GatewayEvent, now?: number) => void;
  /** Forget the profile's session (the next send opens a new one). */
  resetThread: (profile: string) => void;
}

export function emptyThread(profile: string): ProfileThread {
  return {
    profile,
    sessionId: null,
    storedSessionId: null,
    transcript: createTranscript(profile),
    opening: false,
    deciding: null,
    error: null,
    restored: false,
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// The store listens to whichever client `getGatewayClient()` returns. Tests
// swap the client with `setGatewayClient`, so the subscription follows the
// instance rather than being taken once at import.
let subscribedTo: GatewayClientLike | null = null;
let unsubscribe: (() => void) | null = null;
let unsubscribeAcp: (() => void) | null = null;
const restoring = new Map<string, Promise<void>>();

function acpId(target: string): string | null {
  return target.startsWith("acp:") ? target.slice(4) : null;
}

function ensureSubscribed(apply: (event: GatewayEvent) => void) {
  const client = getGatewayClient();
  if (subscribedTo === client) return;
  unsubscribe?.();
  subscribedTo = client;
  unsubscribe = client.onAny(apply);
}

export const useSessionStore = create<SessionStoreState>()((set, get) => {
  const update = (profile: string, patch: (thread: ProfileThread) => ProfileThread) =>
    set((state) => {
      const current = state.threads[profile] ?? emptyThread(profile);
      return { threads: { ...state.threads, [profile]: patch(current) } };
    });

  const applyEvent = (event: GatewayEvent, now: number = Date.now()) => {
    const sid = event.session_id;
    if (!sid) return;
    const thread = Object.values(get().threads).find((t) => t.sessionId === sid);
    if (!thread) return;
    const transcript = reduceTranscript(thread.transcript, event, now);
    // An event the reducer ignores must not mint a new thread object, or
    // every subscriber re-renders for nothing.
    if (transcript === thread.transcript) return;
    const next = { ...thread, transcript };
    update(thread.profile, () => next);
    if (next.sessionId && next.storedSessionId) {
      writeSessionPointer(thread.profile, {
        runtimeSessionId: next.sessionId,
        storedSessionId: next.storedSessionId,
        usage: next.transcript.usage,
        approvalMode: next.transcript.approvalMode,
      });
    }
  };

  const restore = async (profile: string): Promise<void> => {
    if (get().threads[profile]?.restored) return;
    const active = restoring.get(profile);
    if (active) return active;

    const task = (async () => {
      if (acpId(profile)) {
        update(profile, (thread) => ({ ...thread, restored: true }));
        return;
      }
      const pointer = readSessionPointer(profile);
      if (!pointer) {
        update(profile, (thread) => ({ ...thread, restored: true }));
        return;
      }

      const client = getGatewayClient();
      ensureSubscribed(applyEvent);
      update(profile, (thread) => ({
        ...thread,
        sessionId: pointer.runtimeSessionId,
        storedSessionId: pointer.storedSessionId,
        opening: true,
        error: null,
      }));

      let sessionId = pointer.runtimeSessionId;
      let storedSessionId = pointer.storedSessionId;
      let messages;
      let usage = pointer.usage;
      let approvalMode = pointer.approvalMode;
      try {
        messages = (await sessionHistory(client, sessionId)).messages ?? [];
      } catch (error) {
        if (!(error instanceof JsonRpcGatewayError) || error.code !== SESSION_NOT_FOUND) throw error;
        try {
          const resumed = await resumeSession(client, { profile, storedSessionId });
          sessionId = resumed.session_id;
          storedSessionId = resumed.stored_session_id || storedSessionId;
          messages = resumed.messages ?? [];
          const info = resumed.info;
          const resumedUsage = info?.usage;
          if (resumedUsage && typeof resumedUsage === "object") usage = resumedUsage as typeof usage;
          if (info?.yolo === true) approvalMode = "off";
          else if (info?.approval_mode === "manual" || info?.approval_mode === "smart" || info?.approval_mode === "off") {
            approvalMode = info.approval_mode;
          }
        } catch (resumeError) {
          if (resumeError instanceof JsonRpcGatewayError && resumeError.code === 4007) {
            clearSessionPointer(profile);
            update(profile, () => ({ ...emptyThread(profile), restored: true }));
            return;
          }
          throw resumeError;
        }
      }

      const transcript = transcriptFromHistory(profile, messages, { usage, approvalMode });
      update(profile, (thread) => ({
        ...thread,
        sessionId,
        storedSessionId,
        transcript,
        opening: false,
        restored: true,
      }));

      // History is the completed baseline. Replaying from zero lets us rebuild
      // a turn that was in flight when the app disappeared; completed events
      // through the newest message.complete are already represented above.
      const replay = await sessionEventsSince(client, sessionId, 0).catch(() => null);
      const events = replay?.events ?? [];
      let tail = 0;
      events.forEach((event, index) => {
        if (event.type === "message.complete") tail = index + 1;
      });
      for (const event of events.slice(tail)) applyEvent(event);

      const current = get().threads[profile];
      if (current?.sessionId && current.storedSessionId) {
        writeSessionPointer(profile, {
          runtimeSessionId: current.sessionId,
          storedSessionId: current.storedSessionId,
          usage: current.transcript.usage,
          approvalMode: current.transcript.approvalMode,
        });
      }
    })()
      .catch((error) => {
        update(profile, (thread) => ({
          ...thread,
          opening: false,
          restored: true,
          error: errorText(error),
        }));
        throw error;
      })
      .finally(() => restoring.delete(profile));

    restoring.set(profile, task);
    return task;
  };

  const ensureSession = async (profile: string): Promise<string> => {
    await restore(profile);
    const existing = get().threads[profile];
    if (existing?.sessionId) return existing.sessionId;
    update(profile, (t) => ({ ...t, opening: true, error: null }));
    try {
      const agentId = acpId(profile);
      if (agentId) unsubscribeAcp ??= onAcpEvent(applyEvent);
      else ensureSubscribed(applyEvent);
      const created = agentId
        ? { session_id: await createAcpSession(agentId), stored_session_id: undefined }
        : await createSessionHandle(getGatewayClient(), { profile });
      const sessionId = created.session_id;
      const storedSessionId = created.stored_session_id || sessionId;
      update(profile, (t) => ({ ...t, sessionId, storedSessionId, opening: false, restored: true }));
      if (!agentId) {
        writeSessionPointer(profile, {
          runtimeSessionId: sessionId,
          storedSessionId,
          usage: null,
          approvalMode: null,
        });
      }
      return sessionId;
    } catch (error) {
      update(profile, (t) => ({ ...t, opening: false, error: errorText(error) }));
      throw error;
    }
  };

  return {
    selectedProfile: null,
    selectedRoomId: null,
    profileDirectory: {},
    threads: {},

    setProfileDirectory: (profiles) =>
      set({ profileDirectory: Object.fromEntries(profiles.map((profile) => [profile.name, profile])) }),

    selectProfile: (profile) => set({ selectedProfile: profile, selectedRoomId: profile ? null : get().selectedRoomId }),
    selectRoom: (roomId) => set({ selectedRoomId: roomId }),

    ensureSession,
    restore,

    send: async (profile, text, attachments = []) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) throw new Error("Nothing to send.");
      await restore(profile);
      const current = get().threads[profile];
      if (current && transcriptBusy(current.transcript)) {
        throw new Error("A turn is already running.");
      }
      const now = Date.now();
      const visible = [trimmed, ...attachments.map((attachment) => `[Attached: ${attachment.name}]`)].filter(Boolean).join("\n");
      update(profile, (t) => ({
        ...t,
        error: null,
        transcript: applyTranscriptAction(t.transcript, { type: "user", text: visible, at: now }),
      }));
      const client = getGatewayClient();
      try {
        let sessionId = await ensureSession(profile);
        const agentId = acpId(profile);
        if (agentId) {
          await submitAcpPrompt(sessionId, acpAttachmentPrompt(trimmed, attachments));
          return;
        }
        try {
          await submitPrompt(client, sessionId, await attachmentPrompt(client, sessionId, trimmed, attachments));
        } catch (error) {
          if (!isSessionNotFound(error)) throw error;
          // The gateway restarted under us: resume the durable session once.
          update(profile, (t) => ({ ...t, sessionId: null, restored: false }));
          sessionId = await ensureSession(profile);
          await submitPrompt(client, sessionId, await attachmentPrompt(client, sessionId, trimmed, attachments));
        }
      } catch (error) {
        const reason = errorText(error);
        update(profile, (t) => ({
          ...t,
          error: reason,
          transcript: applyTranscriptAction(t.transcript, {
            type: "failed",
            reason,
            at: Date.now(),
          }),
        }));
        throw error;
      }
    },

    editAndSend: async (profile, messageId, text) => {
      update(profile, (thread) => ({
        ...thread,
        transcript: applyTranscriptAction(thread.transcript, { type: "dropFrom", messageId }),
      }));
      await get().send(profile, text);
    },

    stop: async (profile) => {
      const thread = get().threads[profile];
      if (!thread?.sessionId) return;
      const agentId = acpId(profile);
      if (agentId) await interruptAcpSession(thread.sessionId);
      else await interruptSession(getGatewayClient(), thread.sessionId);
    },

    decideApproval: async (profile, decision, choice) => {
      const thread = get().threads[profile];
      if (!thread?.sessionId) throw new Error("No live session for this decision.");
      update(profile, (t) => ({ ...t, deciding: decision.requestId }));
      try {
        const agentId = acpId(profile);
        if (agentId) await respondAcpApproval({ sessionId: thread.sessionId, requestId: decision.requestId, choice });
        else {
          await respondApproval(getGatewayClient(), {
            sessionId: thread.sessionId,
            requestId: decision.requestId,
            choice,
          });
        }
        update(profile, (t) => ({
          ...t,
          deciding: null,
          transcript: applyTranscriptAction(t.transcript, {
            type: "decided",
            requestId: decision.requestId,
            summary: approvalSummary(decision, choice),
            at: Date.now(),
          }),
        }));
      } catch (error) {
        update(profile, (t) => ({ ...t, deciding: null, error: errorText(error) }));
        throw error;
      }
    },

    decideClarify: async (profile, decision, answers) => {
      if (acpId(profile)) throw new Error("This ACP agent cannot ask structured follow-up questions yet.");
      update(profile, (t) => ({ ...t, deciding: decision.requestId }));
      try {
        await answerClarify(getGatewayClient(), decision, answers);
        const flat = Object.values(answers).flat().join(", ");
        update(profile, (t) => ({
          ...t,
          deciding: null,
          transcript: applyTranscriptAction(t.transcript, {
            type: "decided",
            requestId: decision.requestId,
            summary: clarifySummary(decision, flat),
            at: Date.now(),
          }),
        }));
      } catch (error) {
        update(profile, (t) => ({ ...t, deciding: null, error: errorText(error) }));
        throw error;
      }
    },

    applyEvent,

    resetThread: (profile) =>
      set((state) => {
        clearSessionPointer(profile);
        return { threads: { ...state.threads, [profile]: { ...emptyThread(profile), restored: true } } };
      }),
  };
});

/** The thread for a profile, or an empty one before it has spoken. */
export function selectThread(state: SessionStoreState, profile: string | null): ProfileThread | null {
  if (!profile) return null;
  return state.threads[profile] ?? emptyThread(profile);
}

/** Test hook: drop the gateway subscription so a fresh client is picked up. */
export function resetSessionStoreSubscription() {
  unsubscribe?.();
  unsubscribeAcp?.();
  unsubscribe = null;
  unsubscribeAcp = null;
  subscribedTo = null;
  restoring.clear();
}
