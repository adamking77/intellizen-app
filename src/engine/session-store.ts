// One live session and transcript per Hermes profile, for this app run.
// In memory only: Hermes keeps the durable history.

import { create } from "zustand";

import type { ApprovalChoice, GatewayClientLike } from "./contract";
import {
  answerClarify,
  approvalSummary,
  clarifySummary,
  respondApproval,
} from "./decisions";
import { getGatewayClient } from "./gateway";
import type { GatewayEvent } from "./json-rpc-gateway";
import { createSession, interruptSession, isSessionNotFound, submitPrompt } from "./session";
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
  transcript: TranscriptState;
  /** A session is being created, or a prompt is on its way to the gateway. */
  opening: boolean;
  /** A decision answer is in flight. */
  deciding: string | null;
  error: string | null;
}

export interface SessionStoreState {
  selectedProfile: string | null;
  threads: Record<string, ProfileThread>;
  selectProfile: (profile: string | null) => void;
  /** Make sure a live session exists for the profile; returns its id. */
  ensureSession: (profile: string) => Promise<string>;
  /** Append the person's turn and submit it. Rejects when nothing was sent. */
  send: (profile: string, text: string) => Promise<void>;
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
    transcript: createTranscript(profile),
    opening: false,
    deciding: null,
    error: null,
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
    update(thread.profile, (t) => ({ ...t, transcript }));
  };

  const ensureSession = async (profile: string): Promise<string> => {
    ensureSubscribed(applyEvent);
    const existing = get().threads[profile];
    if (existing?.sessionId) return existing.sessionId;
    update(profile, (t) => ({ ...t, opening: true, error: null }));
    try {
      const sessionId = await createSession(getGatewayClient(), { profile });
      update(profile, (t) => ({ ...t, sessionId, opening: false }));
      return sessionId;
    } catch (error) {
      update(profile, (t) => ({ ...t, opening: false, error: errorText(error) }));
      throw error;
    }
  };

  return {
    selectedProfile: null,
    threads: {},

    selectProfile: (profile) => set({ selectedProfile: profile }),

    ensureSession,

    send: async (profile, text) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Nothing to send.");
      const current = get().threads[profile];
      if (current && transcriptBusy(current.transcript)) {
        throw new Error("A turn is already running.");
      }
      const now = Date.now();
      update(profile, (t) => ({
        ...t,
        error: null,
        transcript: applyTranscriptAction(t.transcript, { type: "user", text: trimmed, at: now }),
      }));
      const client = getGatewayClient();
      try {
        let sessionId = await ensureSession(profile);
        try {
          await submitPrompt(client, sessionId, trimmed);
        } catch (error) {
          if (!isSessionNotFound(error)) throw error;
          // The gateway restarted under us: open a fresh session once.
          update(profile, (t) => ({ ...t, sessionId: null }));
          sessionId = await ensureSession(profile);
          await submitPrompt(client, sessionId, trimmed);
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

    stop: async (profile) => {
      const thread = get().threads[profile];
      if (!thread?.sessionId) return;
      await interruptSession(getGatewayClient(), thread.sessionId);
    },

    decideApproval: async (profile, decision, choice) => {
      const thread = get().threads[profile];
      if (!thread?.sessionId) throw new Error("No live session for this decision.");
      update(profile, (t) => ({ ...t, deciding: decision.requestId }));
      try {
        await respondApproval(getGatewayClient(), {
          sessionId: thread.sessionId,
          requestId: decision.requestId,
          choice,
        });
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
      set((state) => ({ threads: { ...state.threads, [profile]: emptyThread(profile) } })),
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
  unsubscribe = null;
  subscribedTo = null;
}
