import { invoke, isTauri } from "@tauri-apps/api/core";

import { buildHermesWebSocketUrl } from "./websocket-url";

export type EngineMode = "spawned" | "attached";

/** What the Rust side knows about the `hermes serve` this window talks to. */
export type EngineInfo = {
  mode: EngineMode;
  pid: number;
  port: number;
  token: string;
  version: string;
  url: string;
};

export const NOT_DESKTOP_HOST = "offline: not in the desktop host";

/** True inside the Tauri webview; false under vitest and the plain Vite server. */
export function isDesktopHost(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

/** Spawn or attach. Idempotent on the Rust side: a live engine is returned as is. */
export async function startEngine(): Promise<EngineInfo> {
  if (!isDesktopHost()) throw new Error(NOT_DESKTOP_HOST);
  return invoke<EngineInfo>("engine_start");
}

/** Stops the engine only if this app spawned it; forgets an attached one. */
export async function stopEngine(): Promise<void> {
  if (!isDesktopHost()) return;
  await invoke<void>("engine_stop");
}

/** Forget the current engine and its record so the next start spawns fresh.
 *  Used when an attached engine keeps refusing our token. Never kills an
 *  engine we did not spawn. */
export async function resetEngine(): Promise<void> {
  if (!isDesktopHost()) return;
  await invoke<void>("engine_reset");
}

export function engineWebSocketUrl(info: Pick<EngineInfo, "port" | "token">): string {
  return buildHermesWebSocketUrl({
    protocol: "http:",
    host: `127.0.0.1:${info.port}`,
    path: "/api/ws",
    authParam: ["token", info.token],
  });
}
