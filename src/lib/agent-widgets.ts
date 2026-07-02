// In-chat GenUI widget contract, borrowed from agent-native
// (packages/core/src/data-widgets + action-ui.ts renderer ids) per the
// 2026-07-02 adoption spike. Agents attach a widget to a chat result and
// IntelliZen renders it natively — no framework dependency.

export interface AgentDataTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface AgentDataTableWidget {
  title?: string;
  columns: AgentDataTableColumn[];
  rows: Array<Record<string, unknown>>;
  totalRows?: number;
  truncated?: boolean;
}

export interface AgentDataChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface AgentDataChartWidget {
  type: "bar" | "line" | "area";
  title?: string;
  xKey: string;
  series: AgentDataChartSeries[];
  data: Array<Record<string, unknown>>;
}

export interface AgentMetricItem {
  label: string;
  value: string | number;
  delta?: { value: string | number; direction: "up" | "down" | "flat" };
}

export interface AgentRecordLink {
  label: string;
  /** In-app route, e.g. /databases/<db-id>?record=<id> or /investigate. */
  to: string;
  status?: string;
}

export type AgentChatWidget =
  | { kind: "data-table"; title?: string; table: AgentDataTableWidget }
  | { kind: "data-chart"; title?: string; chart: AgentDataChartWidget }
  | { kind: "data-insights"; title?: string; insights: string[] }
  | { kind: "data-metrics"; title?: string; metrics: AgentMetricItem[] }
  | { kind: "record-links"; title?: string; links: AgentRecordLink[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseTable(value: unknown): AgentDataTableWidget | null {
  if (!isRecord(value)) return null;
  const columns = Array.isArray(value.columns)
    ? value.columns.filter(
        (col): col is AgentDataTableColumn =>
          isRecord(col) && typeof col.key === "string" && typeof col.label === "string",
      )
    : [];
  const rows = Array.isArray(value.rows) ? value.rows.filter(isRecord) : [];
  if (columns.length === 0 || rows.length === 0) return null;
  return {
    title: typeof value.title === "string" ? value.title : undefined,
    columns,
    rows,
    totalRows: typeof value.totalRows === "number" ? value.totalRows : undefined,
    truncated: value.truncated === true,
  };
}

function parseChart(value: unknown): AgentDataChartWidget | null {
  if (!isRecord(value)) return null;
  const type = value.type === "bar" || value.type === "line" || value.type === "area" ? value.type : null;
  const series = Array.isArray(value.series)
    ? value.series.filter(
        (item): item is AgentDataChartSeries =>
          isRecord(item) && typeof item.key === "string" && typeof item.label === "string",
      )
    : [];
  const data = Array.isArray(value.data) ? value.data.filter(isRecord) : [];
  if (!type || typeof value.xKey !== "string" || series.length === 0 || data.length === 0) return null;
  return { type, xKey: value.xKey, series, data, title: typeof value.title === "string" ? value.title : undefined };
}

/** Parse an agent-native-style widget envelope from an agent result payload. */
export function parseAgentChatWidget(value: unknown): AgentChatWidget | null {
  if (!isRecord(value)) return null;
  const title = typeof value.title === "string" ? value.title : undefined;

  if (value.kind === "data-table" || isRecord(value.table)) {
    const table = parseTable(value.table ?? value);
    return table ? { kind: "data-table", title, table } : null;
  }
  if (value.kind === "data-chart" || isRecord(value.chart)) {
    const chart = parseChart(value.chart ?? value);
    return chart ? { kind: "data-chart", title, chart } : null;
  }
  if (value.kind === "data-insights" || Array.isArray(value.insights)) {
    const insights = asStringList(value.insights);
    return insights.length > 0 ? { kind: "data-insights", title, insights } : null;
  }
  if (value.kind === "data-metrics" || Array.isArray(value.metrics)) {
    const metrics = (Array.isArray(value.metrics) ? value.metrics : [])
      .filter(
        (item): item is AgentMetricItem =>
          isRecord(item) && typeof item.label === "string" &&
          (typeof item.value === "string" || typeof item.value === "number"),
      );
    return metrics.length > 0 ? { kind: "data-metrics", title, metrics } : null;
  }
  if (value.kind === "record-links" || Array.isArray(value.links)) {
    const links = (Array.isArray(value.links) ? value.links : [])
      .filter(
        (item): item is AgentRecordLink =>
          isRecord(item) && typeof item.label === "string" &&
          typeof item.to === "string" && item.to.startsWith("/"),
      );
    return links.length > 0 ? { kind: "record-links", title, links } : null;
  }
  return null;
}

/**
 * System prompt fragment teaching streamed-chat agents the widget contract.
 * Fenced ```genui blocks are extracted client-side and rendered natively.
 */
export const GENUI_SYSTEM_PROMPT = `You are replying inside the IntelliZen Agent Panel (a compact chat sidebar). Reply in plain conversational markdown.

When a table, chart, or metric list genuinely communicates better than prose, emit it as a fenced block exactly like this:

\`\`\`genui
{"kind": "data-chart", "title": "...", "chart": {"type": "bar", "xKey": "label", "series": [{"key": "value", "label": "..."}], "data": [{"label": "...", "value": 1}]}}
\`\`\`

Supported kinds:
- "data-table": {"table": {"columns": [{"key", "label"}], "rows": [...]}}
- "data-chart": bar charts as shown above
- "data-insights": {"insights": ["..."]}
- "data-metrics": {"metrics": [{"label": "Open work", "value": 12, "delta": {"value": "+3", "direction": "up"}}]} — renders as the app's native metric cells; use for KPI/stat readouts
- "record-links": {"links": [{"label": "Task name", "to": "/databases/<database-id>?record=<record-id>", "status": "In progress"}]} — renders as clickable in-app links; use when referencing IntelliZen records, workflows, or routes you know the ids for

One JSON object per genui block. The app renders these with its own native components.

NEVER draw charts with unicode block characters, ASCII art, or markdown tables of bars — always use a genui block instead.`;

const GENUI_FENCE_RE = /```genui\s*\n([\s\S]*?)```/g;

/** Extract genui widget blocks out of streamed reply text. */
export function extractGenuiBlocks(text: string): { text: string; widgets: AgentChatWidget[] } {
  const widgets: AgentChatWidget[] = [];
  const cleaned = text
    .replace(GENUI_FENCE_RE, (_match, json: string) => {
      try {
        const widget = parseAgentChatWidget(JSON.parse(json.trim()));
        if (widget) widgets.push(widget);
      } catch {
        /* malformed widget JSON — drop the block rather than show raw JSON */
      }
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, widgets };
}

/** Streaming display: hide completed genui blocks and any unterminated tail. */
export function stripGenuiForStreaming(text: string): string {
  const withoutComplete = text.replace(GENUI_FENCE_RE, "").trimEnd();
  const openFence = withoutComplete.lastIndexOf("```genui");
  return (openFence === -1 ? withoutComplete : withoutComplete.slice(0, openFence)).trimEnd();
}

export interface AgentChatResult {
  reply: string | null;
  widget: AgentChatWidget | null;
}

/**
 * Extract a human reply and optional GenUI widget from a fiona_inbox result.
 * Accepts a bare string, or an object with message/summary/reply text and a
 * widget (or first of widgets) in the agent-native envelope shape.
 */
export function parseAgentChatResult(result: unknown): AgentChatResult {
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) return { reply: null, widget: null };
    // Results are often stored as stringified JSON (text column); decode
    // structured payloads before falling back to plain-text replies.
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return parseAgentChatResult(JSON.parse(trimmed));
      } catch {
        /* plain text that happens to start with a brace */
      }
    }
    return { reply: trimmed, widget: null };
  }
  if (!isRecord(result)) return { reply: null, widget: null };

  const textCandidate = [result.message, result.reply, result.summary, result.text].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
  );
  const widgetSource = result.widget ?? (Array.isArray(result.widgets) ? result.widgets[0] : null);
  return {
    reply: textCandidate?.trim() ?? null,
    widget: parseAgentChatWidget(widgetSource),
  };
}
