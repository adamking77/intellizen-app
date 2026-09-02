// Shared test helpers for the engine layer: a fake gateway client and the
// recorded frame fixtures. Not shipped; only test files import this.

import approvalTurn from "@/fixtures/gateway-frames/default-approval-turn.json";
import dateTurn from "@/fixtures/gateway-frames/default-date-turn.json";
import profilesList from "@/fixtures/gateway-frames/profiles-list.json";

import type { GatewayClientLike } from "./contract";
import type { ConnectionState, GatewayEvent } from "./json-rpc-gateway";

export interface RecordedFrame {
  dir: "in" | "out";
  t: number;
  frame: {
    jsonrpc?: string;
    id?: string;
    method?: string;
    params?: GatewayEvent & Record<string, unknown>;
    result?: unknown;
    error?: { code?: number; message?: string };
  };
}

export interface RecordedTurn {
  recordedAt: string;
  hermesPin: string;
  profile: string;
  sessionId: string;
  prompt: string;
  frames: RecordedFrame[];
}

const TURNS: Record<string, unknown> = {
  "default-date-turn": dateTurn,
  "default-approval-turn": approvalTurn,
};

/** A deep copy, so a test that mutates frames cannot leak into the next. */
export function loadTurn(name: "default-date-turn" | "default-approval-turn"): RecordedTurn {
  const turn = TURNS[name];
  if (!turn) throw new Error(`unknown fixture ${name}`);
  return JSON.parse(JSON.stringify(turn)) as RecordedTurn;
}

export function loadProfilesList(): { result: { profiles: Record<string, unknown>[] } } {
  return JSON.parse(JSON.stringify(profilesList)) as { result: { profiles: Record<string, unknown>[] } };
}

/** The gateway events a recorded turn carried, in order, with their times. */
export function turnEvents(turn: RecordedTurn): Array<{ t: number; event: GatewayEvent }> {
  return turn.frames
    .filter((f) => f.dir === "in" && f.frame.method === "event" && f.frame.params?.type)
    .map((f) => ({ t: f.t, event: f.frame.params as GatewayEvent }));
}

export interface FakeCall {
  method: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
}

/** A gateway client that records requests and lets a test emit events. */
export class FakeGatewayClient implements GatewayClientLike {
  connectionState: ConnectionState = "open";
  calls: FakeCall[] = [];
  private handlers = new Set<(event: GatewayEvent) => void>();
  private stateHandlers = new Set<(state: ConnectionState) => void>();
  private responders: Array<(call: FakeCall) => unknown | Promise<unknown>> = [];
  private sessionCounter = 0;

  /** Queue a responder consulted for every request; return `undefined` to fall
   *  through to the defaults (`session.create` → a fresh id, else `{}`). */
  respondWith(fn: (call: FakeCall) => unknown | Promise<unknown>) {
    this.responders.push(fn);
  }

  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<T> {
    const call: FakeCall = { method, params, timeoutMs };
    this.calls.push(call);
    for (const responder of this.responders) {
      const out = await responder(call);
      if (out !== undefined) return out as T;
    }
    if (method === "session.create") {
      this.sessionCounter += 1;
      return { session_id: `fake${this.sessionCounter}`, stored_session_id: `stored${this.sessionCounter}` } as T;
    }
    if (method === "prompt.submit") return { status: "streaming" } as T;
    return {} as T;
  }

  onAny(handler: (event: GatewayEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onState(handler: (state: ConnectionState) => void): () => void {
    this.stateHandlers.add(handler);
    handler(this.connectionState);
    return () => this.stateHandlers.delete(handler);
  }

  setState(state: ConnectionState) {
    this.connectionState = state;
    for (const h of this.stateHandlers) h(state);
  }

  emit(event: GatewayEvent) {
    for (const h of [...this.handlers]) h(event);
  }

  get listenerCount() {
    return this.handlers.size;
  }

  callsTo(method: string) {
    return this.calls.filter((c) => c.method === method);
  }
}
