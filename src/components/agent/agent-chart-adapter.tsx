import { Bar } from "@/components/charts/bar";
import { BarChart as BklitBarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { Line, LineChart as BklitLineChart } from "@/components/charts/line-chart";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import type { AgentDataChartSeries, AgentDataChartWidget } from "@/lib/agent-widgets";

const COMPACT_SERIES_COLORS = [
  "var(--accent)",
  "var(--sapphire)",
  "var(--teal)",
  "var(--mauve)",
] as const;

const MAX_COMPACT_SERIES = COMPACT_SERIES_COLORS.length;
const MAX_COMPACT_POINTS = 12;

type PreparedSeries = AgentDataChartSeries & { color: string };

type PreparedAgentChart =
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | {
      state: "ready";
      type: "bar" | "line";
      data: Array<Record<string, unknown>>;
      series: PreparedSeries[];
      xKey: "label" | "date";
      accessibleSummary: string;
    };

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function prepareAgentChart(chart: AgentDataChartWidget): PreparedAgentChart {
  const runtimeType = String(chart.type);
  if (runtimeType === "area") {
    return { state: "error", message: "Area charts are not supported. Use a bar or line chart." };
  }
  if (runtimeType !== "bar" && runtimeType !== "line") {
    return { state: "error", message: "This chart type is not supported." };
  }

  const seenSeries = new Set<string>();
  const series = chart.series
    .filter((item) => {
      if (!item.key.trim() || seenSeries.has(item.key)) return false;
      seenSeries.add(item.key);
      return true;
    })
    .slice(0, MAX_COMPACT_SERIES)
    .map((item, index) => ({
      ...item,
      color: COMPACT_SERIES_COLORS[index % COMPACT_SERIES_COLORS.length],
    }));

  if (series.length === 0 || chart.data.length === 0) {
    return { state: "empty", message: "No chart data." };
  }

  const sourceRows = chart.data.slice(0, MAX_COMPACT_POINTS);
  const data: Array<Record<string, unknown>> = sourceRows.map((row) => {
    const values = Object.fromEntries(series.map((item) => [item.key, finiteNumber(row[item.key])]));
    if (runtimeType === "bar") {
      return { label: String(row[chart.xKey] ?? "—"), ...values };
    }

    const rawDate = row[chart.xKey];
    const date = rawDate instanceof Date ? rawDate : new Date(String(rawDate ?? ""));
    return { date, ...values };
  });

  if (runtimeType === "line" && data.some((row) => {
    const date = row.date;
    return !(date instanceof Date) || Number.isNaN(date.getTime());
  })) {
    return { state: "error", message: "Line charts need date-like x-axis values." };
  }

  const hasNumericData = data.some((row) => series.some((item) => typeof row[item.key] === "number"));
  if (!hasNumericData) {
    return { state: "empty", message: "No numeric values to chart." };
  }

  if (runtimeType === "line") {
    data.sort((left, right) => (left.date as Date).getTime() - (right.date as Date).getTime());
  }

  const accessibleSummary = data
    .map((row) => {
      const xValue = runtimeType === "line"
        ? (row.date as Date).toLocaleDateString()
        : String(row.label);
      const values = series
        .map((item) => `${item.label}: ${typeof row[item.key] === "number" ? row[item.key] : "no value"}`)
        .join(", ");
      return `${xValue}, ${values}`;
    })
    .join("; ");

  return {
    state: "ready",
    type: runtimeType,
    data,
    series,
    xKey: runtimeType === "line" ? "date" : "label",
    accessibleSummary,
  };
}

function ChartState({ tone, message }: { tone: "empty" | "error"; message: string }) {
  return (
    <div
      className={
        tone === "error"
          ? "m-2 rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-4 text-center font-ui text-[11px] text-[var(--danger)]"
          : "m-2 rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center font-ui text-[11px] text-[var(--overlay-1)]"
      }
      role={tone === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

function SeriesLegend({ series }: { series: PreparedSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pb-1 pt-2" aria-hidden="true">
      {series.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1 font-ui text-[10px] text-[var(--overlay-1)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function AgentChartAdapter({ chart }: { chart: AgentDataChartWidget }) {
  const prepared = prepareAgentChart(chart);
  if (prepared.state !== "ready") {
    return <ChartState tone={prepared.state} message={prepared.message} />;
  }

  const tooltipRows = (point: Record<string, unknown>) => prepared.series.map((item) => ({
    color: item.color,
    label: item.label,
    value: finiteNumber(point[item.key]) ?? "—",
  }));

  return (
    <div
      aria-label={`${prepared.type === "bar" ? "Bar" : "Line"} chart. ${prepared.accessibleSummary}`}
      className="overflow-hidden"
      role="img"
    >
      <SeriesLegend series={prepared.series} />
      <div className="h-[180px] px-1 pb-1">
        {prepared.type === "bar" ? (
          <BklitBarChart
            animationDuration={0}
            aspectRatio="auto"
            className="h-full"
            data={prepared.data}
            margin={{ top: 10, right: 8, bottom: 34, left: 34 }}
            xDataKey={prepared.xKey}
          >
            <Grid fadeHorizontal={false} horizontal strokeDasharray="0" />
            {prepared.series.map((item) => (
              <Bar
                animate={false}
                dataKey={item.key}
                fill={item.color}
                key={item.key}
                lineCap={3}
                stroke={item.color}
              />
            ))}
            <YAxis numTicks={4} />
            <BarXAxis maxLabels={6} tickerHalfWidth={32} />
            <ChartTooltip rows={tooltipRows} showDatePill={false} showDots={false} />
          </BklitBarChart>
        ) : (
          <BklitLineChart
            animationDuration={0}
            aspectRatio="auto"
            className="h-full"
            data={prepared.data}
            margin={{ top: 10, right: 8, bottom: 34, left: 34 }}
            xDataKey={prepared.xKey}
          >
            <Grid fadeHorizontal={false} horizontal strokeDasharray="0" />
            {prepared.series.map((item) => (
              <Line
                animate={false}
                dataKey={item.key}
                fadeEdges={false}
                key={item.key}
                showMarkers={prepared.data.length <= 8}
                stroke={item.color}
                strokeWidth={2}
              />
            ))}
            <YAxis numTicks={4} />
            <XAxis numTicks={Math.min(prepared.data.length, 4)} tickMode="data" tickerHalfWidth={32} />
            <ChartTooltip rows={tooltipRows} showDatePill={false} />
          </BklitLineChart>
        )}
      </div>
    </div>
  );
}
