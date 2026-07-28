export const DEFAULT_RUNTIME_KEY = "intelizen:settings:default-runtime";
export const DEFAULT_EXECUTION_KEY = "intelizen:settings:default-execution";
export const ALLOW_RUN_OVERRIDE_KEY = "intelizen:settings:allow-run-override";

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
}
