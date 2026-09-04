import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngineInfo, EngineMode } from "./engine";
import type { ConnectionState } from "./json-rpc-gateway";
import { FakeGatewayClient } from "./test-support";
import { ATTACHED_RESET_AFTER, createEngineSupervisor, gatewayMatchesPinnedContract, RETRY_DELAY_MS } from "./use-engine";

describe("gatewayMatchesPinnedContract", () => {
  it("requires the pinned concurrency guarantee", async () => {
    const compatible = new FakeGatewayClient();
    compatible.respondWith(() => ({ per_session_exclusive_submit: true }));
    await expect(gatewayMatchesPinnedContract(compatible)).resolves.toBe(true);

    const incompatible = new FakeGatewayClient();
    incompatible.respondWith(() => ({}));
    await expect(gatewayMatchesPinnedContract(incompatible)).resolves.toBe(false);
  });
});

const engine = (port: number, mode: EngineMode = "spawned"): EngineInfo => ({
  mode,
  pid: 1000 + port,
  port,
  token: "tok",
  version: "0.21.0",
  url: `http://127.0.0.1:${port}`,
});

type ClientOptions = {
  /** Reject this many connect calls before succeeding. */
  failConnectTimes?: number;
  /** On the first connect: open, then drop the socket before connect() returns. */
  dropAfterFirstOpen?: boolean;
  /** Match the real client: reuse an open socket without emitting another event. */
  reuseOpenWithoutEvent?: boolean;
};

function fakeClient(options: ClientOptions = {}) {
  const handlers = new Set<(state: ConnectionState) => void>();
  let state: ConnectionState = "idle";
  let failuresLeft = options.failConnectTimes ?? 0;
  let dropOnce = options.dropAfterFirstOpen ?? false;
  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    for (const handler of handlers) handler(next);
  };
  const connect = vi.fn(async (_url: string) => {
    if (state === "open" && options.reuseOpenWithoutEvent) return;
    setState("connecting");
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      setState("error");
      throw new Error("WebSocket connection failed");
    }
    setState("open");
    if (dropOnce) {
      dropOnce = false;
      setState("closed");
    }
  });
  const onState = (handler: (state: ConnectionState) => void) => {
    handlers.add(handler);
    handler(state);
    return () => handlers.delete(handler);
  };
  return {
    connect,
    onState,
    setState,
    get connectionState() { return state; },
    get state() { return state; },
  };
}

function harness(options: ClientOptions & { start?: () => Promise<EngineInfo> } = {}) {
  const client = fakeClient(options);
  const start = vi.fn(options.start ?? (async () => engine(56083)));
  const reset = vi.fn(async () => {});
  const setConnection = vi.fn();
  const setInfo = vi.fn();
  const setError = vi.fn();
  const checkCompatibility = vi.fn(async () => true);
  const setPinCompatible = vi.fn();
  const supervisor = createEngineSupervisor({ start, reset, client, setConnection, setInfo, setError, checkCompatibility, setPinCompatible });
  return { client, start, reset, setConnection, setInfo, setError, checkCompatibility, setPinCompatible, supervisor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createEngineSupervisor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the engine, connects with the token url, and mirrors state", async () => {
    const h = harness();
    await h.supervisor.boot();

    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.setInfo).toHaveBeenCalledWith(engine(56083));
    expect(h.client.connect).toHaveBeenCalledWith("ws://127.0.0.1:56083/api/ws?token=tok");
    expect(h.setConnection.mock.calls.map(([state]) => state)).toEqual(["idle", "connecting", "open"]);
    expect(h.setError).toHaveBeenLastCalledWith(null);
    expect(h.checkCompatibility).toHaveBeenCalledOnce();
    expect(h.setPinCompatible).toHaveBeenLastCalledWith(true);
    expect(h.reset).not.toHaveBeenCalled();
    h.supervisor.dispose();
  });

  it("restores open state when connect reuses an existing socket", async () => {
    const h = harness({ reuseOpenWithoutEvent: true });
    await h.supervisor.boot();
    h.setConnection.mockClear();

    // This is what the manual Connect action does before asking the existing
    // supervisor to boot again. The gateway is still open, so connect() emits
    // nothing and the supervisor must reconcile its current state.
    h.setConnection("connecting");
    await h.supervisor.boot();

    expect(h.client.connect).toHaveBeenCalledTimes(2);
    expect(h.setConnection).toHaveBeenLastCalledWith("open");
    h.supervisor.dispose();
  });

  it("waits, starts again and reconnects after the socket closes", async () => {
    const h = harness();
    await h.supervisor.boot();
    h.start.mockResolvedValueOnce(engine(60001));

    h.client.setState("closed");
    expect(h.start).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
    expect(h.start).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.client.connect).toHaveBeenLastCalledWith("ws://127.0.0.1:60001/api/ws?token=tok");
    expect(h.client.state).toBe("open");
    h.supervisor.dispose();
  });

  it("reports a start failure as the error and keeps retrying", async () => {
    const h = harness({
      start: vi
        .fn<() => Promise<EngineInfo>>()
        .mockRejectedValueOnce(new Error("Hermes is not installed"))
        .mockResolvedValue(engine(56083)),
    });
    await h.supervisor.boot();

    expect(h.setError).toHaveBeenCalledWith("Hermes is not installed");
    expect(h.client.connect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.client.state).toBe("open");
    // Cleared only once the socket is actually open.
    expect(h.setError).toHaveBeenLastCalledWith(null);
    h.supervisor.dispose();
  });

  it("schedules one retry per failed connect, not one per signal", async () => {
    const h = harness({ failConnectTimes: 10 });
    await h.supervisor.boot();
    expect(h.setError).toHaveBeenCalledWith("WebSocket connection failed");

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(3);
    h.supervisor.dispose();
  });

  it("resets an attached engine that refuses three connects, then spawns fresh", async () => {
    const attached = engine(60164, "attached");
    const h = harness({
      failConnectTimes: ATTACHED_RESET_AFTER,
      start: vi.fn<() => Promise<EngineInfo>>().mockResolvedValue(attached),
    });
    await h.supervisor.boot();
    expect(h.reset).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.reset).not.toHaveBeenCalled();

    // After the reset the record is gone, so the next start spawns.
    h.start.mockResolvedValueOnce(attached).mockResolvedValue(engine(60777, "spawned"));
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(3);
    expect(h.reset).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(4);
    expect(h.setInfo).toHaveBeenLastCalledWith(engine(60777, "spawned"));
    expect(h.client.connect).toHaveBeenLastCalledWith("ws://127.0.0.1:60777/api/ws?token=tok");
    expect(h.client.state).toBe("open");
    expect(h.reset).toHaveBeenCalledTimes(1);
    h.supervisor.dispose();
  });

  it("never resets a spawned engine, however often connect fails", async () => {
    const h = harness({ failConnectTimes: 10 });
    await h.supervisor.boot();
    for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(7);
    expect(h.reset).not.toHaveBeenCalled();
    h.supervisor.dispose();
  });

  it("a stale close arriving while a boot is in flight does not double boot", async () => {
    const pending = deferred<EngineInfo>();
    const h = harness({ start: () => pending.promise });
    const booting = h.supervisor.boot();

    // The previous socket's close lands while start() is still pending.
    h.client.setState("closed");
    pending.resolve(engine(56083));
    await booting;

    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.client.state).toBe("open");
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 3);
    expect(h.start).toHaveBeenCalledTimes(1);
    h.supervisor.dispose();
  });

  it("a close that lands mid-boot and leaves us disconnected is retried once", async () => {
    const h = harness({ dropAfterFirstOpen: true });
    await h.supervisor.boot();
    expect(h.client.state).toBe("closed");
    expect(h.start).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.client.state).toBe("open");
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2);
    expect(h.start).toHaveBeenCalledTimes(2);
    h.supervisor.dispose();
  });

  it("stops retrying once disposed", async () => {
    const h = harness();
    await h.supervisor.boot();
    h.supervisor.dispose();

    h.client.setState("closed");
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 4);
    expect(h.start).toHaveBeenCalledTimes(1);
  });
});
