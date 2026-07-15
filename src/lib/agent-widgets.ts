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

export const AGENT_WIDGET_CONTRACT_VERSION = 1 as const;

export type AgentWidgetContractVersion = typeof AGENT_WIDGET_CONTRACT_VERSION;

export interface AgentDataChartWidget {
  type: "bar" | "line";
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

type VersionedAgentWidget = { version: AgentWidgetContractVersion };

export type AgentChatWidget = VersionedAgentWidget & (
  | { kind: "data-table"; title?: string; table: AgentDataTableWidget }
  | { kind: "data-chart"; title?: string; chart: AgentDataChartWidget }
  | { kind: "data-insights"; title?: string; insights: string[] }
  | { kind: "data-metrics"; title?: string; metrics: AgentMetricItem[] }
  | { kind: "record-links"; title?: string; links: AgentRecordLink[] }
  | { kind: "html"; title?: string; html: string }
);

export type AgentWidgetParseErrorCode =
  | "invalid-widget"
  | "unsupported-version"
  | "unsupported-kind"
  | "unsupported-chart-type";

export type AgentWidgetParseResult =
  | { ok: true; widget: AgentChatWidget }
  | { ok: false; code: AgentWidgetParseErrorCode; message: string };

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

function parseChart(value: unknown): AgentWidgetParseResult | AgentDataChartWidget {
  if (!isRecord(value)) {
    return { ok: false, code: "invalid-widget", message: "Chart data is missing or malformed." };
  }
  if (value.type === "area") {
    return {
      ok: false,
      code: "unsupported-chart-type",
      message: "Area charts are not supported. Use a bar or line chart.",
    };
  }
  const type = value.type === "bar" || value.type === "line" ? value.type : null;
  const series = Array.isArray(value.series)
    ? value.series.filter(
        (item): item is AgentDataChartSeries =>
          isRecord(item) && typeof item.key === "string" && typeof item.label === "string",
      )
    : [];
  const data = Array.isArray(value.data) ? value.data.filter(isRecord) : [];
  if (!type) {
    return {
      ok: false,
      code: "unsupported-chart-type",
      message: "This chart type is not supported. Use a bar or line chart.",
    };
  }
  if (typeof value.xKey !== "string" || series.length === 0 || data.length === 0) {
    return { ok: false, code: "invalid-widget", message: "Chart data is missing required axes, series, or rows." };
  }
  return { type, xKey: value.xKey, series, data, title: typeof value.title === "string" ? value.title : undefined };
}

function parseVersion(value: Record<string, unknown>): AgentWidgetParseResult | AgentWidgetContractVersion {
  const version = value.version ?? AGENT_WIDGET_CONTRACT_VERSION;
  if (version !== AGENT_WIDGET_CONTRACT_VERSION) {
    return {
      ok: false,
      code: "unsupported-version",
      message: `Widget contract version ${String(version)} is not supported.`,
    };
  }
  return AGENT_WIDGET_CONTRACT_VERSION;
}

/**
 * Parse an agent-native-style widget envelope and retain a readable reason
 * when it cannot be rendered. Unversioned payloads are treated as legacy v1.
 */
export function parseAgentChatWidgetResult(value: unknown): AgentWidgetParseResult {
  if (!isRecord(value)) {
    return { ok: false, code: "invalid-widget", message: "Widget data is missing or malformed." };
  }
  const versionResult = parseVersion(value);
  if (typeof versionResult !== "number") return versionResult;
  const title = typeof value.title === "string" ? value.title : undefined;

  if (value.kind === "data-table" || isRecord(value.table)) {
    const table = parseTable(value.table ?? value);
    return table
      ? { ok: true, widget: { version: versionResult, kind: "data-table", title, table } }
      : { ok: false, code: "invalid-widget", message: "Table data is missing columns or rows." };
  }
  if (value.kind === "data-chart" || isRecord(value.chart)) {
    const chart = parseChart(value.chart ?? value);
    if ("ok" in chart) return chart;
    return { ok: true, widget: { version: versionResult, kind: "data-chart", title, chart } };
  }
  if (value.kind === "data-insights" || Array.isArray(value.insights)) {
    const insights = asStringList(value.insights);
    return insights.length > 0
      ? { ok: true, widget: { version: versionResult, kind: "data-insights", title, insights } }
      : { ok: false, code: "invalid-widget", message: "Insights widget has no readable insights." };
  }
  if (value.kind === "data-metrics" || Array.isArray(value.metrics)) {
    const metrics = (Array.isArray(value.metrics) ? value.metrics : [])
      .filter(
        (item): item is AgentMetricItem =>
          isRecord(item) && typeof item.label === "string" &&
          (typeof item.value === "string" || typeof item.value === "number"),
      );
    return metrics.length > 0
      ? { ok: true, widget: { version: versionResult, kind: "data-metrics", title, metrics } }
      : { ok: false, code: "invalid-widget", message: "Metrics widget has no readable metrics." };
  }
  if (value.kind === "html" && typeof value.html === "string" && value.html.trim()) {
    // Rendered in a hard sandbox (no network, opaque origin); cap size.
    return { ok: true, widget: { version: versionResult, kind: "html", title, html: value.html.slice(0, 100_000) } };
  }
  if (value.kind === "record-links" || Array.isArray(value.links)) {
    const links = (Array.isArray(value.links) ? value.links : [])
      .filter(
        (item): item is AgentRecordLink =>
          isRecord(item) && typeof item.label === "string" &&
          typeof item.to === "string" && item.to.startsWith("/"),
      );
    return links.length > 0
      ? { ok: true, widget: { version: versionResult, kind: "record-links", title, links } }
      : { ok: false, code: "invalid-widget", message: "Record-links widget has no valid in-app links." };
  }
  return { ok: false, code: "unsupported-kind", message: "This widget type is not supported." };
}

/** Backward-compatible nullable parser for existing callers. */
export function parseAgentChatWidget(value: unknown): AgentChatWidget | null {
  const result = parseAgentChatWidgetResult(value);
  return result.ok ? result.widget : null;
}

/**
 * System prompt fragment teaching streamed-chat agents the widget contract.
 * Fenced ```genui blocks are extracted client-side and rendered natively.
 */
export const GENUI_SYSTEM_PROMPT = `You are replying inside the IntelliZen Agent Panel (a compact chat sidebar). Reply in plain conversational markdown.

When a table, chart, or metric list genuinely communicates better than prose, emit it as a fenced block exactly like this:

\`\`\`genui
{"version": 1, "kind": "data-chart", "title": "...", "chart": {"type": "bar", "xKey": "label", "series": [{"key": "value", "label": "..."}], "data": [{"label": "...", "value": 1}]}}
\`\`\`

Supported kinds:
- Every JSON widget uses \`"version": 1\`. Unversioned widgets are accepted only for legacy compatibility.
- "data-table": {"table": {"columns": [{"key", "label"}], "rows": [...]}}
- "data-chart": multi-series bar or line charts. Line chart x-axis values must be dates. Area charts are unsupported.
- "data-insights": {"insights": ["..."]}
- "data-metrics": {"metrics": [{"label": "Open work", "value": 12, "delta": {"value": "+3", "direction": "up"}}]} — renders as the app's native metric cells; use for KPI/stat readouts
- "record-links": {"links": [{"label": "Task name", "to": "/databases/<database-id>?record=<record-id>", "status": "In progress"}]} — renders as clickable in-app links; use when referencing IntelliZen records, workflows, or routes you know the ids for

One JSON object per genui block. The app renders these with its own native components.

For richer INTERACTIVE views (drill-downs, custom layouts, live data exploration), emit a genui-html block with a complete HTML fragment:

\`\`\`genui-html
<div id="app">…</div>
<script>/* inline JS */</script>
\`\`\`

genui-html rules:
- Runs in a locked sandbox: NO network access, NO external scripts/CDNs — inline script and style only.
- IntelliZen design tokens are available as CSS variables (--base, --mantle, --text, --subtext-0, --overlay-1, --accent, --border, --success, --danger, plus --red/--peach/--yellow/--green/--teal/--blue/--mauve for series colors). Use them; never hardcode other colors.
- Live Supabase data (read-only) via: await window.intellizen.query({ table, filters, orderBy, limit })
  Tables: "workspace_records" (filter by database_id/id; record fields are in the .fields object), "work_events" (filter record_id/workflow_run_id/event_kind/actor), "signals" (status/source), "entities" (entity_type/first_case_id), "claims" (case_id/claim_origin).
  filters: [{column, op: "eq"|"in", value}]. limit max 200. Example:
  const rows = await window.intellizen.query({ table: "entities", filters: [{column: "entity_type", op: "eq", value: "person"}], limit: 50 });
- NEVER use inline event handlers (onclick="..." etc.) — they resolve in global scope and will throw on your closure variables. Attach ONE delegated listener with addEventListener on a stable container and re-render inside it.
- Keep it compact (the panel is ~320-540px wide); the frame auto-sizes to your content up to 600px.
- Prefer the simple genui JSON kinds when they suffice; use genui-html only when interactivity earns it.
- The user can PIN an interactive genui-html widget to Home as a persistent tracker that re-runs on every visit/refresh. So when the user asks for a durable view/tracker/dashboard of their data, fetch the data with window.intellizen.query() inside the widget script (live on every mount) — never hardcode the current values into the HTML. Native JSON widgets are chat-scoped snapshots and are not promoted.

NEVER draw charts with unicode block characters, ASCII art, or markdown tables of bars — always use a genui block instead.`;

const GENUI_FENCE_RE = /```genui\s*\n([\s\S]*?)```/g;
const GENUI_HTML_FENCE_RE = /```genui-html\s*\n([\s\S]*?)```/g;

/** Extract genui widget blocks out of streamed reply text. */
export function extractGenuiBlocks(text: string): { text: string; widgets: AgentChatWidget[] } {
  const widgets: AgentChatWidget[] = [];
  const cleaned = text
    .replace(GENUI_HTML_FENCE_RE, (_match, html: string) => {
      const trimmed = html.trim();
      if (trimmed) {
        widgets.push({ version: AGENT_WIDGET_CONTRACT_VERSION, kind: "html", html: trimmed.slice(0, 100_000) });
        return "";
      }
      return widgetFallbackText("Generated HTML was empty.");
    })
    .replace(GENUI_FENCE_RE, (_match, json: string) => {
      try {
        const parsed = parseAgentChatWidgetResult(JSON.parse(json.trim()));
        if (parsed.ok) {
          widgets.push(parsed.widget);
          return "";
        }
        return widgetFallbackText(parsed.message);
      } catch {
        return widgetFallbackText("Widget JSON was malformed.");
      }
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, widgets };
}

function widgetFallbackText(message: string) {
  return `\n\nWidget unavailable: ${message}\n\n`;
}

/** Streaming display: hide completed genui blocks and any unterminated tail. */
export function stripGenuiForStreaming(text: string): string {
  const withoutComplete = text.replace(GENUI_HTML_FENCE_RE, "").replace(GENUI_FENCE_RE, "").trimEnd();
  const openFence = withoutComplete.lastIndexOf("```genui");
  return (openFence === -1 ? withoutComplete : withoutComplete.slice(0, openFence)).trimEnd();
}

export interface AgentChatResult {
  reply: string | null;
  widgets: AgentChatWidget[];
  /** First widget retained for compatibility with the current single-widget turn renderer. */
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
    if (!trimmed) return { reply: null, widgets: [], widget: null };
    // Results are often stored as stringified JSON (text column); decode
    // structured payloads before falling back to plain-text replies.
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return parseAgentChatResult(JSON.parse(trimmed));
      } catch {
        /* plain text that happens to start with a brace */
      }
    }
    return { reply: trimmed, widgets: [], widget: null };
  }
  if (!isRecord(result)) return { reply: null, widgets: [], widget: null };

  const textCandidate = [result.message, result.reply, result.summary, result.text].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
  );
  const widgetSources = Array.isArray(result.widgets)
    ? result.widgets
    : result.widget == null
      ? []
      : [result.widget];
  const parsedWidgets = widgetSources.map(parseAgentChatWidgetResult);
  const widgets = parsedWidgets.flatMap((parsed) => parsed.ok ? [parsed.widget] : []);
  const warnings = parsedWidgets.flatMap((parsed) => parsed.ok ? [] : [widgetFallbackText(parsed.message).trim()]);
  const replyParts = [textCandidate?.trim(), ...warnings].filter((part): part is string => Boolean(part));
  return {
    reply: replyParts.length > 0 ? replyParts.join("\n\n") : null,
    widgets,
    widget: widgets[0] ?? null,
  };
}
