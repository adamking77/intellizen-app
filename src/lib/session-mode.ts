import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";

export type SessionMode = "thinking" | "deciding" | "executing" | "not_today";

export const SESSION_MODE_KEY = "intelizen:session-mode";
export const SET_ASIDE_MATERIALS_KEY = "intelizen:set-aside-materials";
export const RESTING_AGENTS_KEY = "intelizen:resting-agents";

interface StoredSessionMode {
  launchId: string;
  mode: SessionMode | null;
  lastAvailabilityAnswer: SessionMode | null;
}

interface StoredRestingAgents {
  launchId: string;
  agents: string[];
}

interface SessionModeSnapshot extends StoredSessionMode {
  ready: boolean;
  restingAgents: string[];
}

const CHANNEL = "intelizen-session-mode";
const EMPTY: SessionModeSnapshot = { ready: false, launchId: "", mode: null, lastAvailabilityAnswer: null, restingAgents: [] };
let current = EMPTY;
let starting: Promise<void> | null = null;
const listeners = new Set<() => void>();

function validMode(value: unknown): value is SessionMode {
  return value === "thinking" || value === "deciding" || value === "executing" || value === "not_today";
}

function readStored(): StoredSessionMode | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_MODE_KEY) ?? "null") as Record<string, unknown> | null;
    if (!parsed || typeof parsed.launchId !== "string") return null;
    return {
      launchId: parsed.launchId,
      mode: validMode(parsed.mode) ? parsed.mode : null,
      lastAvailabilityAnswer: validMode(parsed.lastAvailabilityAnswer) ? parsed.lastAvailabilityAnswer : null,
    };
  } catch {
    return null;
  }
}

function agentKeys(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && /^(hermes|acp):.+/.test(item)))]
    : [];
}

function readStoredRestingAgents(): StoredRestingAgents | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESTING_AGENTS_KEY) ?? "null") as Record<string, unknown> | null;
    if (!parsed || typeof parsed.launchId !== "string") return null;
    return { launchId: parsed.launchId, agents: agentKeys(parsed.agents) };
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function store(next: StoredSessionMode & { restingAgents?: string[] }, broadcast = true) {
  const restingAgents = next.restingAgents ?? current.restingAgents;
  current = { ready: true, ...next, restingAgents };
  try {
    window.localStorage.setItem(SESSION_MODE_KEY, JSON.stringify({ launchId: next.launchId, mode: next.mode, lastAvailabilityAnswer: next.lastAvailabilityAnswer }));
    window.localStorage.setItem(RESTING_AGENTS_KEY, JSON.stringify({ launchId: next.launchId, agents: restingAgents }));
  } catch {
    /* Keep the active mode in this webview when storage is unavailable. */
  }
  if (broadcast && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(current);
    channel.close();
  }
  emit();
}

function adopt(value: unknown) {
  const parsed = typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  if (!current.ready || !parsed || parsed.launchId !== current.launchId) return;
  current = {
    ready: true,
    launchId: current.launchId,
    mode: validMode(parsed.mode) ? parsed.mode : null,
    lastAvailabilityAnswer: validMode(parsed.lastAvailabilityAnswer) ? parsed.lastAvailabilityAnswer : null,
    restingAgents: agentKeys(parsed.restingAgents),
  };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_MODE_KEY && event.key !== RESTING_AGENTS_KEY) return;
    const session = readStored();
    if (!session) return;
    const resting = readStoredRestingAgents();
    adopt({ ...session, restingAgents: resting?.launchId === session.launchId ? resting.agents : [] });
  };
  window.addEventListener("storage", onStorage);
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => adopt(event.data);
  }
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}

async function nativeLaunchId() {
  if (!isTauri()) return "browser";
  return invoke<string>("app_launch_id");
}

export function initializeSessionMode(getLaunchId: () => Promise<string> = nativeLaunchId) {
  if (starting) return starting;
  starting = getLaunchId()
    .then((launchId) => {
      const saved = readStored();
      const resting = readStoredRestingAgents();
      const session = saved?.launchId === launchId
        ? saved
        : { launchId, mode: null, lastAvailabilityAnswer: saved?.lastAvailabilityAnswer ?? null };
      store({ ...session, restingAgents: resting?.launchId === launchId ? resting.agents : [] });
    })
    .catch(() => {
      // Without native identity, a reload cannot be distinguished from an app
      // restart. Stay read-only and retry instead of guessing across that boundary.
      starting = null;
    });
  return starting;
}

export function readSessionMode() {
  return current.mode;
}

export function setSessionMode(mode: SessionMode | null) {
  if (!current.ready) return;
  store({ launchId: current.launchId, mode, lastAvailabilityAnswer: current.lastAvailabilityAnswer });
}

export function setLastAvailabilityAnswer(lastAvailabilityAnswer: SessionMode | null) {
  if (!current.ready) return;
  store({ launchId: current.launchId, mode: current.mode, lastAvailabilityAnswer });
}

export function readRestingAgents() {
  return current.restingAgents;
}

export function setRestingAgents(restingAgents: string[]) {
  if (!current.ready) return;
  store({ launchId: current.launchId, mode: current.mode, lastAvailabilityAnswer: current.lastAvailabilityAnswer, restingAgents: agentKeys(restingAgents) });
}

function useSessionSnapshot() {
  useEffect(() => {
    const initialize = () => { void initializeSessionMode(); };
    initialize();
    window.addEventListener("focus", initialize);
    return () => window.removeEventListener("focus", initialize);
  }, []);
  return useSyncExternalStore(subscribe, () => current, () => EMPTY);
}

export function useSessionMode() {
  const snapshot = useSessionSnapshot();
  return {
    ready: snapshot.ready,
    mode: snapshot.mode,
    setMode: setSessionMode,
    lastAvailabilityAnswer: snapshot.lastAvailabilityAnswer,
    setLastAvailabilityAnswer,
  } as const;
}

export function useRestingAgents() {
  const snapshot = useSessionSnapshot();
  return { ready: snapshot.ready, restingAgents: snapshot.restingAgents, setRestingAgents } as const;
}

export function resetSessionModeForTests() {
  current = EMPTY;
  starting = null;
  emit();
}
