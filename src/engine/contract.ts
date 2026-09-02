// The seam between IntelliZen and the Hermes gateway. Every method the app
// calls and every event it renders is listed here, and
// `gateway-parity.test.ts` checks each name against the pinned Hermes source
// (`HERMES_PIN`). Add a name here before using it anywhere else.

import type {
  ConnectionState,
  GatewayEvent,
  JsonRpcGatewayClient,
} from "./json-rpc-gateway";

export const GATEWAY_METHODS = [
  "session.create",
  "prompt.submit",
  "session.interrupt",
  "profiles.list",
  "approval.respond",
  "clarify.respond",
  // Sent by the copied client on its own for replay after a reconnect. (Its
  // `gateway.ping` heartbeat is answered inside ws.py, not by a @method, and
  // the client is copied from the same pin, so it is not listed.)
  "session.events.since",
  // wave-1 agents-page: the profile editor (tui_gateway/methods_profiles.py).
  "profiles.describe",
  "profiles.configure",
  "profiles.create",
  "profiles.get_asset",
  "profiles.set_asset",
] as const;

export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

export const GATEWAY_EVENTS = [
  "gateway.ready",
  "message.start",
  "message.delta",
  "message.complete",
  "thinking.delta",
  "reasoning.delta",
  "tool.start",
  "tool.complete",
  "status.update",
  "approval.request",
  "clarify.request",
  "session.usage",
  "session.info",
] as const;

export type GatewayEventName = (typeof GATEWAY_EVENTS)[number];

/** The slice of the gateway client the session layer needs. Tests hand in a
 *  fake with this shape; production hands in `getGatewayClient()`. */
export interface GatewayClientLike {
  readonly connectionState: ConnectionState;
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<T>;
  onAny(handler: (event: GatewayEvent) => void): () => void;
  onState(handler: (state: ConnectionState) => void): () => void;
}

// A JsonRpcGatewayClient is a GatewayClientLike; keep that true at compile time.
const _assertClientShape: (client: JsonRpcGatewayClient) => GatewayClientLike = (
  client,
) => client;
void _assertClientShape;

/** Call a gateway method. Only names in `GATEWAY_METHODS` compile. */
export function request<T>(
  client: GatewayClientLike,
  method: GatewayMethod,
  params: Record<string, unknown> = {},
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  return client.request<T>(method, params, options.timeoutMs, options.signal);
}

// ── Payloads, as the pinned Hermes emits them ───────────────────────────

export interface SessionCreateResult {
  session_id: string;
  stored_session_id?: string;
}

export interface MessageDeltaPayload {
  text?: string;
}

export type TurnStatus = "complete" | "error" | "interrupted";

export interface MessageCompletePayload {
  text?: string;
  status?: TurnStatus | string;
  error?: string;
  usage?: SessionUsage;
  reasoning?: string;
  warning?: string;
}

export interface ToolStartPayload {
  tool_id?: string;
  name?: string;
  /** An 80-character preview of the arguments, e.g. the shell command. */
  context?: string;
  args?: Record<string, unknown>;
}

export interface ToolCompletePayload {
  tool_id?: string;
  name?: string;
  args?: Record<string, unknown>;
  duration_s?: number;
  result?: unknown;
  summary?: string;
  result_text?: string;
  inline_diff?: string;
}

export interface StatusUpdatePayload {
  kind?: string;
  text?: string;
}

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export interface ApprovalRequestPayload {
  request_id?: string;
  command?: string;
  description?: string;
  choices?: ApprovalChoice[];
  pattern_key?: string;
  pattern_keys?: string[];
  allow_session?: boolean;
  allow_permanent?: boolean;
}

export interface ClarifyQuestionPayload {
  qid?: string;
  question?: string;
  choices?: string[];
  multi_select?: boolean;
}

export interface ClarifyRequestPayload extends ClarifyQuestionPayload {
  request_id?: string;
  questions?: ClarifyQuestionPayload[];
}

export interface SessionUsage {
  model?: string;
  input?: number;
  output?: number;
  total?: number;
  context_used?: number;
  context_max?: number;
  context_percent?: number;
  [key: string]: unknown;
}

export interface SessionUsagePayload {
  usage?: SessionUsage;
}

export interface SessionInfoPayload {
  model?: string;
  provider?: string;
  approval_mode?: "manual" | "smart" | "off" | string;
  yolo?: boolean;
  [key: string]: unknown;
}
