import { create } from "zustand";

import type { EngineInfo } from "./engine";
import type { ConnectionState } from "./json-rpc-gateway";

export type EngineTag = "connected" | "pin mismatch" | "starting…" | "offline";

type EngineStore = {
  connection: ConnectionState;
  info: EngineInfo | null;
  error: string | null;
  pinCompatible: boolean | null;
  setConnection: (connection: ConnectionState) => void;
  setInfo: (info: EngineInfo | null) => void;
  setError: (error: string | null) => void;
  setPinCompatible: (compatible: boolean | null) => void;
};

export const useEngineStore = create<EngineStore>((set) => ({
  connection: "idle",
  info: null,
  error: null,
  pinCompatible: null,
  setConnection: (connection) => set({ connection }),
  setInfo: (info) => set({ info }),
  setError: (error) => set({ error }),
  setPinCompatible: (pinCompatible) => set({ pinCompatible }),
}));

/** The footer tag. Open wins; an error means offline; anything else is a boot
 *  or a reconnect in progress. */
export function deriveEngineTag(state: Pick<EngineStore, "connection" | "error"> & { pinCompatible?: boolean | null }): EngineTag {
  if (state.connection === "open") return state.pinCompatible === false ? "pin mismatch" : "connected";
  if (state.error) return "offline";
  return "starting…";
}

/** Tooltip text: which Hermes, where, and whether we spawned it. */
export function describeEngine(state: Pick<EngineStore, "connection" | "info" | "error"> & { pinCompatible?: boolean | null }): string {
  const tag = deriveEngineTag(state);
  if (tag === "offline") return state.error ?? "Hermes offline";
  if (tag === "starting…" || !state.info) return "Starting Hermes…";
  const { version, url, mode, pid } = state.info;
  const how = mode === "spawned" ? "spawned by IntelliZen" : "attached";
  const engine = `Hermes ${version} at ${url}, ${how} (pid ${pid})`;
  return tag === "pin mismatch" ? `${engine}; runtime capabilities do not match HERMES_PIN` : engine;
}
