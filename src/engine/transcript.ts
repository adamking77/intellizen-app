// A pure reducer from gateway events to the donor's `Message` shape
// (hermes-app `src/types.ts`). No I/O, no clock: `now` is passed in so the
// fixture tests are deterministic.

import type {
  ApprovalChoice,
  ApprovalRequestPayload,
  ClarifyRequestPayload,
  MessageCompletePayload,
  MessageDeltaPayload,
  SessionInfoPayload,
  SessionUsage,
  SessionUsagePayload,
  StatusUpdatePayload,
  TodoItem,
  ToolCompletePayload,
  ToolOutputRiskPayload,
  ToolStartPayload,
} from "./contract";
import type { GatewayEvent } from "./json-rpc-gateway";

export interface ToolRow {
  id: string;
  name: string;
  /** What to show on the row: the argument preview when there is one. */
  title: string;
  /** Undefined while the tool runs or when stored history has no outcome. */
  ok?: boolean;
  historical?: boolean;
  resultText?: string;
  durationMs?: number;
  risk?: string;
  findings?: string[];
  redacted?: boolean;
}

/** A decision the person made, kept on the turn as a fact line. */
export interface TurnFact {
  id: string;
  text: string;
  at: number;
}

export interface Message {
  id: string;
  /** "you", or the profile name. */
  from: string;
  text: string;
  thought?: string;
  tools?: ToolRow[];
  facts?: TurnFact[];
  streaming?: boolean;
  failed?: string;
  tookMs?: number;
  prompt?: string;
  at?: number;
}

export interface ApprovalDecision {
  kind: "approval";
  requestId: string;
  command: string;
  description: string;
  choices: ApprovalChoice[];
  /** The agent turn the request arrived inside, so the card renders there. */
  messageId: string;
  at: number;
}

export interface ClarifyQuestion {
  qid?: string;
  question: string;
  choices: string[];
  multiSelect: boolean;
}

export interface ClarifyDecision {
  kind: "clarify";
  requestId: string;
  questions: ClarifyQuestion[];
  messageId: string;
  at: number;
}

export type Decision = ApprovalDecision | ClarifyDecision;

export interface TurnOutcome {
  ok: boolean;
  status: "complete" | "error" | "interrupted";
  tookMs: number;
  at: number;
}

export interface TranscriptState {
  /** Who answers in this transcript: the Hermes profile name. */
  agent: string;
  messages: Message[];
  pending: Decision[];
  /** The agent's own progress label while a turn runs (status.update,
   *  thinking.delta). Cleared when the turn ends. */
  status: string | null;
  /** When the current turn was asked; null when idle. */
  turnStartedAt: number | null;
  /** How the most recent turn ended; null before the first turn. */
  lastTurn: TurnOutcome | null;
  usage: SessionUsage | null;
  todos: TodoItem[];
  notice: { key: string; text: string } | null;
  /** How this session asks before dangerous commands, from `session.info`:
   *  "manual" asks first, "smart" asks when unsure, "off" never asks. */
  approvalMode: "manual" | "smart" | "off" | null;
  /** Monotonic counter for message ids. */
  seq: number;
}

export function createTranscript(agent: string): TranscriptState {
  return {
    agent,
    messages: [],
    pending: [],
    status: null,
    turnStartedAt: null,
    lastTurn: null,
    usage: null,
    todos: [],
    notice: null,
    approvalMode: null,
    seq: 0,
  };
}

export type TranscriptAction =
  | { type: "user"; text: string; at: number }
  | { type: "dropFrom"; messageId: string }
  | { type: "decided"; requestId: string; summary: string; at: number }
  | { type: "failed"; reason: string; at: number }
  | { type: "reset" };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nextId(state: TranscriptState): [TranscriptState, string] {
  const seq = state.seq + 1;
  return [{ ...state, seq }, `t${seq}`];
}

function lastMessage(state: TranscriptState): Message | undefined {
  return state.messages[state.messages.length - 1];
}

/** The agent turn events attach to: the open streaming one, or a new one. */
function withOpenTurn(
  state: TranscriptState,
  now: number,
): [TranscriptState, Message] {
  const last = lastMessage(state);
  if (last && last.from !== "you" && last.streaming) return [state, last];
  const [next, id] = nextId(state);
  const prompt = [...next.messages].reverse().find((m) => m.from === "you")?.text;
  const turn: Message = {
    id,
    from: next.agent,
    text: "",
    streaming: true,
    at: now,
    ...(prompt !== undefined ? { prompt } : {}),
  };
  return [{ ...next, messages: [...next.messages, turn] }, turn];
}

function replaceMessage(
  state: TranscriptState,
  id: string,
  update: (message: Message) => Message,
): TranscriptState {
  return {
    ...state,
    messages: state.messages.map((m) => (m.id === id ? update(m) : m)),
  };
}

/** Whether a tool's result reads as a failure. Hermes ships tool results as
 *  the tool's own JSON, so this reads the shapes the built-in tools use. */
export function toolResultOk(result: unknown, summary?: string): boolean {
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (r.error) return false;
    if (r.success === false) return false;
    if (typeof r.exit_code === "number" && r.exit_code !== 0) return false;
    return true;
  }
  if (typeof result === "string") {
    const head = result.trimStart().slice(0, 12).toLowerCase();
    if (head.startsWith("error")) return false;
  }
  if (summary && /^(✗|error|failed)/i.test(summary.trim())) return false;
  return true;
}

export function toolResultText(payload: ToolCompletePayload): string {
  if (payload.result_text) return payload.result_text;
  const result = payload.result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof r.output === "string" && r.output.trim()) parts.push(r.output.trimEnd());
    if (typeof r.error === "string" && r.error.trim()) parts.push(r.error.trimEnd());
    if (parts.length > 0) return parts.join("\n");
    if (payload.summary) return payload.summary;
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return "";
    }
  }
  if (typeof result === "string" && result.trim()) return result;
  return payload.summary ?? "";
}

function clarifyQuestions(payload: ClarifyRequestPayload): ClarifyQuestion[] {
  const rows = Array.isArray(payload.questions) && payload.questions.length > 0
    ? payload.questions
    : [payload];
  return rows
    .map((q) => ({
      ...(q.qid ? { qid: q.qid } : {}),
      question: text(q.question),
      choices: Array.isArray(q.choices) ? q.choices.map((c) => text(c)).filter(Boolean) : [],
      multiSelect: q.multi_select === true,
    }))
    .filter((q) => q.question || q.choices.length > 0);
}

/** Fold one gateway event into the transcript. Unknown events are ignored. */
export function reduceTranscript(
  state: TranscriptState,
  event: GatewayEvent,
  now: number = Date.now(),
): TranscriptState {
  switch (event.type) {
    case "message.start": {
      const [next] = withOpenTurn(state, now);
      return next;
    }

    case "message.delta": {
      const delta = text((event.payload as MessageDeltaPayload | undefined)?.text);
      if (!delta) return state;
      const [next, turn] = withOpenTurn(state, now);
      return replaceMessage(next, turn.id, (m) => ({ ...m, text: m.text + delta }));
    }

    case "message.interim": {
      const payload = (event.payload ?? {}) as MessageDeltaPayload;
      const value = text(payload.text);
      if (!value) return state;
      const [next, turn] = withOpenTurn(state, now);
      return replaceMessage(next, turn.id, (message) => ({
        ...message,
        text: value || message.text,
        streaming: false,
      }));
    }

    case "reasoning.delta": {
      const delta = text((event.payload as MessageDeltaPayload | undefined)?.text);
      if (!delta) return state;
      const [next, turn] = withOpenTurn(state, now);
      return replaceMessage(next, turn.id, (m) => ({
        ...m,
        thought: (m.thought ?? "") + delta,
      }));
    }

    case "reasoning.available": {
      const value = text((event.payload as MessageDeltaPayload | undefined)?.text);
      if (!value) return state;
      const [next, turn] = withOpenTurn(state, now);
      if (turn.thought) return next;
      return replaceMessage(next, turn.id, (message) => ({ ...message, thought: value }));
    }

    case "thinking.delta": {
      // Hermes uses this channel for its spinner phrase ("formulating…"),
      // and an empty text clears it. It is progress, not the model's thought.
      const label = text((event.payload as MessageDeltaPayload | undefined)?.text).trim();
      if (state.turnStartedAt === null && !label) return state;
      return { ...state, status: label || null };
    }

    case "status.update": {
      const payload = event.payload as StatusUpdatePayload | undefined;
      const label = text(payload?.text).trim();
      return { ...state, status: label || null };
    }

    case "tool.start": {
      const payload = (event.payload ?? {}) as ToolStartPayload;
      const [next, turn] = withOpenTurn(state, now);
      const name = text(payload.name) || "tool";
      const id = text(payload.tool_id) || `${turn.id}-tool-${(turn.tools?.length ?? 0) + 1}`;
      const row: ToolRow = { id, name, title: text(payload.context) || name };
      return replaceMessage(next, turn.id, (m) => ({
        ...m,
        tools: [...(m.tools ?? []), row],
      }));
    }

    case "tool.generating": {
      const name = text((event.payload as { name?: unknown } | undefined)?.name).trim();
      return { ...state, status: name ? `Preparing ${name}…` : "Preparing a tool…" };
    }

    case "tool.output_risk": {
      const payload = (event.payload ?? {}) as ToolOutputRiskPayload;
      const toolId = text(payload.tool_id);
      if (!toolId) return state;
      let changed = false;
      const messages = state.messages.map((message) => {
        let toolChanged = false;
        const tools = message.tools?.map((tool) => {
          if (tool.id !== toolId) return tool;
          changed = true;
          toolChanged = true;
          return {
            ...tool,
            risk: text(payload.risk) || "low",
            findings: Array.isArray(payload.findings) ? payload.findings.map(text).filter(Boolean) : [],
            redacted: payload.redacted === true,
          };
        });
        return toolChanged && tools ? { ...message, tools } : message;
      });
      return changed ? { ...state, messages } : state;
    }

    case "tool.complete": {
      const payload = (event.payload ?? {}) as ToolCompletePayload;
      const [next, turn] = withOpenTurn(state, now);
      const toolId = text(payload.tool_id);
      const tools = [...(turn.tools ?? [])];
      let index = toolId ? tools.findIndex((t) => t.id === toolId) : -1;
      if (index === -1) index = tools.findIndex((t) => t.ok === undefined);
      const settled: Partial<ToolRow> = {
        ok: toolResultOk(payload.result, payload.summary),
        resultText: toolResultText(payload),
        ...(typeof payload.duration_s === "number"
          ? { durationMs: Math.max(0, Math.round(payload.duration_s * 1000)) }
          : {}),
      };
      if (index === -1) {
        const name = text(payload.name) || "tool";
        const context = text(payload.args?.command as unknown) || name;
        tools.push({
          id: toolId || `${turn.id}-tool-${tools.length + 1}`,
          name,
          title: context,
          ...settled,
        });
      } else {
        tools[index] = { ...tools[index], ...settled };
      }
      return replaceMessage(next, turn.id, (m) => ({ ...m, tools }));
    }

    case "approval.request": {
      const payload = (event.payload ?? {}) as ApprovalRequestPayload;
      const requestId = text(payload.request_id);
      if (!requestId || state.pending.some((d) => d.requestId === requestId)) return state;
      const [next, turn] = withOpenTurn(state, now);
      const choices = Array.isArray(payload.choices) && payload.choices.length > 0
        ? payload.choices
        : (["once", "deny"] as ApprovalChoice[]);
      const decision: ApprovalDecision = {
        kind: "approval",
        requestId,
        command: text(payload.command),
        description: text(payload.description),
        choices,
        messageId: turn.id,
        at: now,
      };
      return { ...next, pending: [...next.pending, decision] };
    }

    case "clarify.request": {
      const payload = (event.payload ?? {}) as ClarifyRequestPayload;
      const requestId = text(payload.request_id);
      if (!requestId || state.pending.some((d) => d.requestId === requestId)) return state;
      const questions = clarifyQuestions(payload);
      if (questions.length === 0) return state;
      const [next, turn] = withOpenTurn(state, now);
      const decision: ClarifyDecision = {
        kind: "clarify",
        requestId,
        questions,
        messageId: turn.id,
        at: now,
      };
      return { ...next, pending: [...next.pending, decision] };
    }

    case "message.complete": {
      const payload = (event.payload ?? {}) as MessageCompletePayload;
      const [next, turn] = withOpenTurn(state, now);
      const status: TurnOutcome["status"] =
        payload.status === "error"
          ? "error"
          : payload.status === "interrupted"
            ? "interrupted"
            : "complete";
      const finalText = text(payload.text);
      const tookMs = Math.max(0, now - (next.turnStartedAt ?? turn.at ?? now));
      const failure =
        status === "error"
          ? text(payload.error).trim() || finalText.trim() || "Hermes reported an error"
          : undefined;
      const settledTurn = replaceMessage(next, turn.id, (m) => ({
        ...m,
        // Streamed text is the same words; the final text wins when present
        // because it is what Hermes stored.
        text: finalText || m.text,
        streaming: false,
        tookMs,
        ...(failure ? { failed: failure } : {}),
        ...(status === "interrupted"
          ? { facts: [...(m.facts ?? []), { id: `${m.id}-stopped`, text: "Stopped", at: now }] }
          : {}),
        // A pending decision cannot outlive its turn.
        tools: (m.tools ?? []).map((t) => (t.ok === undefined ? { ...t, ok: false } : t)),
      }));
      return {
        ...settledTurn,
        pending: [],
        status: null,
        turnStartedAt: null,
        usage: payload.usage ?? settledTurn.usage,
        lastTurn: { ok: status !== "error", status, tookMs, at: now },
      };
    }

    case "session.usage": {
      const usage = (event.payload as SessionUsagePayload | undefined)?.usage;
      return usage ? { ...state, usage } : state;
    }

    case "session.info": {
      const info = (event.payload ?? {}) as SessionInfoPayload;
      const mode = info.yolo === true
        ? "off"
        : info.approval_mode === "manual" || info.approval_mode === "smart" || info.approval_mode === "off"
          ? info.approval_mode
          : null;
      return mode === state.approvalMode ? state : { ...state, approvalMode: mode };
    }

    case "todo.updated": {
      const rows = (event.payload as { todos?: unknown } | undefined)?.todos;
      if (!Array.isArray(rows)) return state;
      const todos = rows
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => ({
          ...(typeof row.id === "string" ? { id: row.id } : {}),
          ...(typeof row.content === "string" ? { content: row.content } : {}),
          ...(typeof row.status === "string" ? { status: row.status } : {}),
        }));
      return { ...state, todos };
    }

    case "notification.show": {
      const payload = (event.payload ?? {}) as { key?: unknown; text?: unknown };
      const key = text(payload.key);
      const notice = text(payload.text);
      return key && notice ? { ...state, notice: { key, text: notice } } : state;
    }

    case "notification.clear": {
      const key = text((event.payload as { key?: unknown } | undefined)?.key);
      return state.notice && key === state.notice.key ? { ...state, notice: null } : state;
    }

    default: {
      // `approval.expire` / `clarify.expire` are minted from the request
      // name at runtime; a timed-out decision leaves the thread.
      if (typeof event.type === "string" && event.type.endsWith(".expire")) {
        const requestId = text((event.payload as { request_id?: unknown } | undefined)?.request_id);
        if (!requestId) return state;
        return { ...state, pending: state.pending.filter((d) => d.requestId !== requestId) };
      }
      return state;
    }
  }
}

/** Local actions: the person's own turn, a decision they answered, a failure
 *  before the gateway ever saw the prompt. */
export function applyTranscriptAction(
  state: TranscriptState,
  action: TranscriptAction,
): TranscriptState {
  switch (action.type) {
    case "user": {
      const [next, id] = nextId(state);
      const turn: Message = { id, from: "you", text: action.text, at: action.at };
      return {
        ...next,
        messages: [...next.messages, turn],
        turnStartedAt: action.at,
        status: null,
      };
    }
    case "dropFrom": {
      const index = state.messages.findIndex((message) => message.id === action.messageId);
      if (index < 0) return state;
      const messages = state.messages.slice(0, index);
      const kept = new Set(messages.map((message) => message.id));
      return {
        ...state,
        messages,
        pending: state.pending.filter((decision) => kept.has(decision.messageId)),
        status: null,
        turnStartedAt: null,
        lastTurn: null,
      };
    }
    case "decided": {
      const decision = state.pending.find((d) => d.requestId === action.requestId);
      const next = {
        ...state,
        pending: state.pending.filter((d) => d.requestId !== action.requestId),
      };
      if (!decision) return next;
      return replaceMessage(next, decision.messageId, (m) => ({
        ...m,
        facts: [
          ...(m.facts ?? []),
          { id: `${m.id}-${action.requestId}`, text: action.summary, at: action.at },
        ],
      }));
    }
    case "failed": {
      const [next, turn] = withOpenTurn(state, action.at);
      const settled = replaceMessage(next, turn.id, (m) => ({
        ...m,
        streaming: false,
        failed: action.reason,
        tookMs: Math.max(0, action.at - (next.turnStartedAt ?? action.at)),
      }));
      return {
        ...settled,
        pending: [],
        status: null,
        turnStartedAt: null,
        lastTurn: {
          ok: false,
          status: "error",
          tookMs: Math.max(0, action.at - (state.turnStartedAt ?? action.at)),
          at: action.at,
        },
      };
    }
    case "reset":
      return createTranscript(state.agent);
    default:
      return state;
  }
}

/** True while the agent is answering the most recent prompt. */
export function transcriptBusy(state: TranscriptState): boolean {
  return state.turnStartedAt !== null;
}
