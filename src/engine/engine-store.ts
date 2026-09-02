import { create } from "zustand";

import type { EngineInfo } from "./engine";
import type { ConnectionState } from "./json-rpc-gateway";

export type EngineTag = "connected" | "starting…" | "offline";

type EngineStore = {
  connection: ConnectionState;
  info: EngineInfo | null;
  error: string | null;
  setConnection: (connection: ConnectionState) => void;
  setInfo: (info: EngineInfo | null) => void;
  setError: (error: string | null) => void;
};

export const useEngineStore = create<EngineStore>((set) => ({
  connection: "idle",
  info: null,
  error: null,
  setConnection: (connection) => set({ connection }),
  setInfo: (info) => set({ info }),
  setError: (error) => set({ error }),
}));

/** The footer tag. Open wins; an error means offline; anything else is a boot
 *  or a reconnect in progress. */
export function deriveEngineTag(state: Pick<EngineStore, "connection" | "error">): EngineTag {
  if (state.connection === "open") return "connected";
  if (state.error) return "offline";
  return "starting…";
}

/** Tooltip text: which Hermes, where, and whether we spawned it. */
export function describeEngine(state: Pick<EngineStore, "connection" | "info" | "error">): string {
  const tag = deriveEngineTag(state);
  if (tag === "offline") return state.error ?? "Hermes offline";
  if (tag === "starting…" || !state.info) return "Starting Hermes…";
  const { version, url, mode, pid } = state.info;
  const how = mode === "spawned" ? "spawned by IntelliZen" : "attached";
  return `Hermes ${version} at ${url}, ${how} (pid ${pid})`;
}
