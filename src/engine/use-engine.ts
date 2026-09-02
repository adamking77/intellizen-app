import { useEffect } from "react";

import {
  engineWebSocketUrl,
  isDesktopHost,
  NOT_DESKTOP_HOST,
  resetEngine,
  startEngine,
  type EngineInfo,
} from "./engine";
import { useEngineStore } from "./engine-store";
import { getGatewayClient } from "./gateway";
import type { ConnectionState, JsonRpcGatewayClient } from "./json-rpc-gateway";

export const RETRY_DELAY_MS = 3_000;
/** Consecutive connect failures against an attached engine before we stop
 *  trusting its record (a wrong token is refused forever otherwise). */
export const ATTACHED_RESET_AFTER = 3;

export type EngineSupervisorDeps = {
  start: () => Promise<EngineInfo>;
  reset: () => Promise<void>;
  client: Pick<JsonRpcGatewayClient, "connect" | "onState">;
  setConnection: (connection: ConnectionState) => void;
  setInfo: (info: EngineInfo) => void;
  setError: (error: string | null) => void;
  retryMs?: number;
  resetAfterFailures?: number;
};

export type EngineSupervisor = {
  boot: () => Promise<void>;
  dispose: () => void;
};

/** Start (or attach to) the engine, connect the gateway client, and keep it
 *  connected: whenever the socket closes or errors, wait, start again (which
 *  respawns a dead process) and reconnect. One retry timer at a time. */
export function createEngineSupervisor(deps: EngineSupervisorDeps): EngineSupervisor {
  const retryMs = deps.retryMs ?? RETRY_DELAY_MS;
  const resetAfter = deps.resetAfterFailures ?? ATTACHED_RESET_AFTER;
  let disposed = false;
  let booting = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastState: ConnectionState = "idle";
  let attachedFailures = 0;
  // A close or error that lands while a boot is in flight is not lost: once
  // the boot settles, it is honoured unless the boot left us open.
  let closedDuringBoot = false;

  const scheduleRetry = () => {
    if (disposed || booting || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void boot();
    }, retryMs);
  };

  const noteConnectFailure = async (info: EngineInfo) => {
    if (info.mode !== "attached") {
      attachedFailures = 0;
      return;
    }
    attachedFailures += 1;
    if (attachedFailures < resetAfter) return;
    attachedFailures = 0;
    // An attached engine that keeps refusing us has no way in from here; drop
    // its record so the next start spawns an engine we hold the token for.
    try {
      await deps.reset();
    } catch {
      /* the next start decides on its own */
    }
  };

  const boot = async () => {
    if (disposed || booting) return;
    booting = true;
    closedDuringBoot = false;
    let failure: string | null = null;
    try {
      const info = await deps.start();
      if (disposed) return;
      deps.setInfo(info);
      try {
        await deps.client.connect(engineWebSocketUrl(info));
      } catch (error) {
        await noteConnectFailure(info);
        throw error;
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      booting = false;
    }
    if (disposed) return;
    if (failure !== null) {
      deps.setError(failure);
      scheduleRetry();
      return;
    }
    if (closedDuringBoot && lastState !== "open") scheduleRetry();
  };

  const attach = () => {
    unsubscribe = deps.client.onState((state) => {
      if (disposed) return;
      lastState = state;
      deps.setConnection(state);
      if (state === "open") {
        deps.setError(null);
        attachedFailures = 0;
      }
      if (state === "closed" || state === "error") {
        if (booting) closedDuringBoot = true;
        scheduleRetry();
      }
    });
  };

  return {
    boot: () => {
      if (!unsubscribe) attach();
      return boot();
    },
    dispose: () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

// Module-level so StrictMode double effects, remounts and HMR of the shell do
// not boot twice; the supervisor lives as long as the window.
const BOOT_FLAG = "__intellizenEngineBoot";
type BootGlobal = typeof globalThis & { [BOOT_FLAG]?: boolean };

/** Call once from the app shell. */
export function useEngineBoot() {
  useEffect(() => {
    const scope = globalThis as BootGlobal;
    if (scope[BOOT_FLAG]) return;
    scope[BOOT_FLAG] = true;
    const store = useEngineStore.getState();
    if (!isDesktopHost()) {
      store.setError(NOT_DESKTOP_HOST);
      return;
    }
    const supervisor = createEngineSupervisor({
      start: startEngine,
      reset: resetEngine,
      client: getGatewayClient(),
      setConnection: store.setConnection,
      setInfo: store.setInfo,
      setError: store.setError,
    });
    void supervisor.boot();
  }, []);
}
