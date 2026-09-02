import { useCallback, useSyncExternalStore } from "react";

export const DEFAULT_RUNTIME_KEY = "intelizen:settings:default-runtime";
export const DEFAULT_EXECUTION_KEY = "intelizen:settings:default-execution";
export const ALLOW_RUN_OVERRIDE_KEY = "intelizen:settings:allow-run-override";
export const DEFAULT_AGENT_CONTEXT_KEY = "intelizen:settings:agent-context";
export const DEFAULT_WORKSPACE_KEY = "intelizen:settings:workspace";
export const SHOW_REASONING_KEY = "intelizen:settings:show-reasoning";
export const SEND_ON_ENTER_KEY = "intelizen:settings:send-on-enter";

const CHANGE_EVENT = "intelizen:settings-changed";

export function readPreference(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* preferences remain session-local when storage is unavailable */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePreference(key: string, fallback: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => readPreference(key, fallback),
    () => fallback,
  );
  const setValue = useCallback((next: string) => writePreference(key, next), [key]);
  return [value, setValue] as const;
}

export function readStringListPreference(key: string): string[] {
  try {
    const parsed = JSON.parse(readPreference(key, "[]")) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function useStringListPreference(key: string) {
  const [raw, setRaw] = usePreference(key, "[]");
  let value: string[] = [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) value = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    /* a malformed local value reads as the safe empty default */
  }
  return [value, (next: string[]) => setRaw(JSON.stringify(next))] as const;
}
