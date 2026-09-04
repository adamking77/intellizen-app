import { useEffect } from "react";

import {
  engineWebSocketUrl,
  isDesktopHost,
  NOT_DESKTOP_HOST,
  resetEngine,
  startEngine,
  stopEngine,
  type EngineInfo,
} from "./engine";
import { useEngineStore } from "./engine-store";
import { getGatewayClient } from "./gateway";
import { request, type GatewayClientLike } from "./contract";
import type { ConnectionState, JsonRpcGatewayClient } from "./json-rpc-gateway";
import {
  ENGINE_MANUAL_DISCONNECT_KEY,
  readPreference,
  RECONNECT_ON_LAUNCH_KEY,
} from "@/lib/settings-preferences";

export const RETRY_DELAY_MS = 3_000;
/** Consecutive connect failures against an attached engine before we stop
 *  trusting its record (a wrong token is refused forever otherwise). */
export const ATTACHED_RESET_AFTER = 3;

type GatewayCapabilities = { per_session_exclusive_submit?: boolean };

/** The pinned client requires the concurrency guarantee advertised by the
 *  pinned gateway. Missing methods and false guarantees are both mismatch. */
export async function gatewayMatchesPinnedContract(client: GatewayClientLike): Promise<boolean> {
  try {
    const capabilities = await request<GatewayCapabilities>(client, "gateway.capabilities");
    return capabilities.per_session_exclusive_submit === true;
  } catch {
    return false;
  }
}

export type EngineSupervisorDeps = {
  start: () => Promise<EngineInfo>;
  reset: () => Promise<void>;
  client: Pick<JsonRpcGatewayClient, "connect" | "connectionState" | "onState">;
  setConnection: (connection: ConnectionState) => void;
  setInfo: (info: EngineInfo) => void;
  setError: (error: string | null) => void;
  checkCompatibility: () => Promise<boolean>;
  setPinCompatible: (compatible: boolean | null) => void;
  retryMs?: number;
  resetAfterFailures?: number;
};

export type EngineSupervisor = {
  boot: () => Promise<void>;
  dispose: () => void;
};

let activeSupervisor: EngineSupervisor | null = null;

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
  let stateEventVersion = 0;
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
      deps.setPinCompatible(null);
      try {
        const stateVersionBeforeConnect = stateEventVersion;
        await deps.client.connect(engineWebSocketUrl(info));
        // connect() intentionally returns without emitting when the existing
        // socket is already open. Reconcile that state explicitly so a manual
        // Connect click cannot leave Settings displaying "connecting" forever.
        if (
          stateEventVersion === stateVersionBeforeConnect
          && deps.client.connectionState === "open"
        ) {
          lastState = "open";
          deps.setConnection("open");
          deps.setError(null);
          attachedFailures = 0;
        }
        const compatible = await deps.checkCompatibility().catch(() => false);
        if (!disposed && deps.client.connectionState === "open") {
          deps.setPinCompatible(compatible);
        }
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
      stateEventVersion += 1;
      lastState = state;
      deps.setConnection(state);
      if (state === "open") {
        deps.setError(null);
        attachedFailures = 0;
      }
      if (state === "closed" || state === "error") {
        deps.setPinCompatible(null);
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

function makeSupervisor() {
  const store = useEngineStore.getState();
  return createEngineSupervisor({
    start: startEngine,
    reset: resetEngine,
    client: getGatewayClient(),
    setConnection: store.setConnection,
    setInfo: store.setInfo,
    setError: store.setError,
    checkCompatibility: () => gatewayMatchesPinnedContract(getGatewayClient()),
    setPinCompatible: store.setPinCompatible,
  });
}

function markManualDisconnect(disconnected: boolean) {
  try {
    window.localStorage.setItem(ENGINE_MANUAL_DISCONNECT_KEY, disconnected ? "1" : "0");
  } catch {
    /* The current window still disconnects when storage is unavailable. */
  }
}

function pauseLocalEngine() {
  activeSupervisor?.dispose();
  activeSupervisor = null;
  getGatewayClient().close();
  const store = useEngineStore.getState();
  store.setConnection("closed");
  store.setInfo(null);
  store.setError(null);
  store.setPinCompatible(null);
  (globalThis as BootGlobal)[BOOT_FLAG] = false;
}

/** Start or reconnect Hermes on demand. Safe to call repeatedly. */
export async function connectEngine() {
  const store = useEngineStore.getState();
  if (!isDesktopHost()) {
    store.setError(NOT_DESKTOP_HOST);
    return;
  }
  // A manual click is a fresh attempt. Clear a stale failure immediately so
  // Settings cannot continue to say "offline" while an existing healthy
  // engine/socket is being reused.
  store.setError(null);
  store.setConnection("connecting");
  markManualDisconnect(false);
  const scope = globalThis as BootGlobal;
  scope[BOOT_FLAG] = true;
  activeSupervisor ??= makeSupervisor();
  await activeSupervisor.boot();
}

/** Stop retrying, close the gateway, and stop an engine spawned by IntelliZen. */
export async function disconnectEngine() {
  markManualDisconnect(true);
  pauseLocalEngine();
  try {
    await stopEngine();
  } finally {
    // The marker only coordinates windows that are alive during this action.
    // Launch behavior continues to be governed by Reconnect on launch.
    markManualDisconnect(false);
  }
}

/** Call once from the app shell. */
export function useEngineBoot() {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ENGINE_MANUAL_DISCONNECT_KEY && event.newValue === "1") {
        pauseLocalEngine();
      }
    };
    window.addEventListener("storage", handleStorage);

    const scope = globalThis as BootGlobal;
    if (!scope[BOOT_FLAG]) {
      const manuallyDisconnected = readPreference(ENGINE_MANUAL_DISCONNECT_KEY, "0") === "1";
      const reconnectOnLaunch = readPreference(RECONNECT_ON_LAUNCH_KEY, "1") !== "0";
      if (manuallyDisconnected || !reconnectOnLaunch) {
        pauseLocalEngine();
      } else {
        void connectEngine();
      }
    }

    return () => window.removeEventListener("storage", handleStorage);
  }, []);
}
