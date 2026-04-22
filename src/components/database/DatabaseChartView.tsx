import { useId, useMemo } from "react";
import type { CSSProperties } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  findDefaultChartGroupField,
  findDefaultChartValueField,
  getChartGroupCandidates,
  getFieldValue,
  getViewRecords,
  resolveRelationLabel,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseChartAggregation,
  WorkspaceDatabaseChartPalette,
  WorkspaceDatabaseChartRange,
  WorkspaceDatabaseField,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseRecordModel,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

interface DatabaseChartViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  onCreateRecord: () => void;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
}

interface ChartDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface ChartTheme {
  series: string[];
  primary: string;
  secondary: string;
  panelEdge: string;
  grid: string;
  axis: string;
  axisLabel: string;
  cursor: string;
  tooltipBorder: string;
  tooltipShadow: string;
  legendHover: string;
}

const CHART_THEMES: Record<WorkspaceDatabaseChartPalette, ChartTheme> = {
  blue: {
    series: ["var(--accent)", "var(--lavender)", "var(--sapphire)", "var(--teal)", "var(--sky)", "var(--blue)", "var(--mauve)", "var(--green)"],
    primary: "var(--accent)",
    secondary: "var(--lavender)",
    panelEdge: "color-mix(in srgb, var(--accent) 18%, var(--border) 82%)",
    grid: "color-mix(in srgb, var(--accent) 12%, var(--border-subtle) 88%)",
    axis: "color-mix(in srgb, var(--accent) 18%, var(--border) 82%)",
    axisLabel: "color-mix(in srgb, var(--subtext-0) 76%, var(--accent) 24%)",
    cursor: "color-mix(in srgb, var(--accent) 14%, transparent 86%)",
    tooltipBorder: "color-mix(in srgb, var(--accent) 28%, var(--border) 72%)",
    tooltipShadow: "0 18px 42px rgba(10, 14, 24, 0.44)",
    legendHover: "color-mix(in srgb, var(--accent-soft) 70%, var(--surface-wash) 30%)",
  },
  rose: {
    series: ["var(--red)", "var(--pink)", "var(--flamingo)", "var(--rosewater)", "var(--mauve)", "var(--peach)", "var(--yellow)", "var(--lavender)"],
    primary: "var(--red)",
    secondary: "var(--pink)",
    panelEdge: "color-mix(in srgb, var(--red) 20%, var(--border) 80%)",
    grid: "color-mix(in srgb, var(--red) 12%, var(--border-subtle) 88%)",
    axis: "color-mix(in srgb, var(--red) 20%, var(--border) 80%)",
    axisLabel: "color-mix(in srgb, var(--subtext-0) 76%, var(--pink) 24%)",
    cursor: "color-mix(in srgb, var(--red) 13%, transparent 87%)",
    tooltipBorder: "color-mix(in srgb, var(--pink) 26%, var(--border) 74%)",
    tooltipShadow: "0 18px 42px rgba(30, 12, 18, 0.42)",
    legendHover: "color-mix(in srgb, var(--red) 11%, var(--surface-wash) 89%)",
  },
  gold: {
    series: ["var(--yellow)", "var(--peach)", "var(--rosewater)", "var(--flamingo)", "var(--maroon)", "var(--red)", "var(--green)", "var(--lavender)"],
    primary: "var(--yellow)",
    secondary: "var(--peach)",
    panelEdge: "color-mix(in srgb, var(--yellow) 16%, var(--border) 84%)",
    grid: "color-mix(in srgb, var(--yellow) 12%, var(--border-subtle) 88%)",
    axis: "color-mix(in srgb, var(--yellow) 18%, var(--border) 82%)",
    axisLabel: "color-mix(in srgb, var(--subtext-0) 78%, var(--yellow) 22%)",
    cursor: "color-mix(in srgb, var(--yellow) 13%, transparent 87%)",
    tooltipBorder: "color-mix(in srgb, var(--peach) 24%, var(--border) 76%)",
    tooltipShadow: "0 18px 42px rgba(32, 20, 8, 0.4)",
    legendHover: "color-mix(in srgb, var(--yellow) 11%, var(--surface-wash) 89%)",
  },
  teal: {
    series: ["var(--teal)", "var(--sky)", "var(--sapphire)", "var(--green)", "var(--accent)", "var(--lavender)", "var(--mauve)", "var(--blue)"],
    primary: "var(--teal)",
    secondary: "var(--sky)",
    panelEdge: "color-mix(in srgb, var(--teal) 18%, var(--border) 82%)",
    grid: "color-mix(in srgb, var(--teal) 12%, var(--border-subtle) 88%)",
    axis: "color-mix(in srgb, var(--teal) 18%, var(--border) 82%)",
    axisLabel: "color-mix(in srgb, var(--subtext-0) 76%, var(--teal) 24%)",
    cursor: "color-mix(in srgb, var(--teal) 13%, transparent 87%)",
    tooltipBorder: "color-mix(in srgb, var(--sky) 24%, var(--border) 76%)",
    tooltipShadow: "0 18px 42px rgba(8, 28, 28, 0.4)",
    legendHover: "color-mix(in srgb, var(--teal) 11%, var(--surface-wash) 89%)",
  },
};

export function DatabaseChartView({
  database,
  view,
  catalog,
  onCreateRecord,
  compact = false,
  compactWidthUnits = 0,
  compactHeightUnits = 0,
  compactPixelWidth = 0,
  compactPixelHeight = 0,
}: DatabaseChartViewProps) {
  const gradientId = useId().replace(/:/g, "");
  const chartType = view.chartType ?? "bar";
  const chartRange = view.chartRange ?? "90d";
  const aggregation = view.chartAggregation ?? "count";
  const theme = CHART_THEMES[view.chartPalette ?? "blue"];
  const groupField =
    database.schema.find((field) => field.id === view.groupBy) ?? findDefaultChartGroupField(database, chartType);
  const valueField =
    database.schema.find((field) => field.id === view.chartValueField) ?? findDefaultChartValueField(database);
  const isValidGroupField = groupField
    ? getChartGroupCandidates(database, chartType).some((field) => field.id === groupField.id)
    : false;

  const records = useMemo(() => getViewRecords(database, view, catalog), [catalog, database, view]);
  const chartRecords = useMemo(
    () => filterChartRecords(records, database, catalog, groupField, chartType, chartRange),
    [catalog, chartRange, chartType, database, groupField, records],
  );

  const rawChartData = useMemo(
    () => buildChartData(chartRecords, database, catalog, groupField, valueField, aggregation, chartType),
    [aggregation, catalog, chartRecords, chartType, database, groupField, valueField],
  );

  const chartData = useMemo(
    () => rawChartData.map((datum, index) => ({ ...datum, color: theme.series[index % theme.series.length] })),
    [rawChartData, theme.series],
  );

  if (!groupField || !isValidGroupField) {
    return (
      <EmptyState
        title={chartType === "line" ? "Line charts need a date field" : "Chart needs a grouping field"}
        description={
          chartType === "line"
            ? "Choose a date, created time, or last edited time field in view settings."
            : "Choose a status, select, relation, date, or similar grouping field in view settings."
        }
        action={{ label: "+ New record", onClick: onCreateRecord }}
      />
    );
  }

  if (aggregation !== "count" && !valueField) {
    return (
      <EmptyState
        title="Chart needs a numeric field"
        description="Choose a number, rollup, or formula field for this chart."
        action={{ label: "+ New record", onClick: onCreateRecord }}
      />
    );
  }

  if (chartData.length === 0) {
    return (
      <EmptyState
        title="No chart data"
        description={
          chartType === "line" && chartRange !== "all"
            ? "Adjust the current filters, widen the time range, or add records in this range."
            : "Adjust the current filters or add records that match this view."
        }
        action={{ label: "+ New record", onClick: onCreateRecord }}
      />
    );
  }

  const total = chartData.reduce((sum, datum) => sum + datum.value, 0);
  const summaryLabel = aggregation === "count" ? `${total} records` : `${formatAggregateValue(total)} ${aggregation}`;
  const valueLabel = aggregation === "count" ? "Count records" : `${capitalize(aggregation)} ${valueField?.name ?? "value"}`;
  const chartContextLabel = chartType === "line" ? `${chartData.length} points` : `${chartData.length} groups`;
  const rangeLabel = chartType === "line" ? formatChartRangeLabel(chartRange) : null;
  const captionParts = [`${valueLabel} by ${groupField.name}`, chartContextLabel, rangeLabel].filter(Boolean);

  return (
    <div className={`db-chart-root${compact ? " db-chart-root--compact" : ""}`} style={getChartThemeStyle(theme)}>
      {!compact ? (
        <div className="db-chart-header">
          <div className="db-chart-meta">
            <span className="db-chart-summary">{summaryLabel}</span>
            <span className="db-chart-caption">{captionParts.join(" · ")}</span>
          </div>
        </div>
      ) : null}

      <div className="db-chart-surface">
        <div className={`db-chart-frame${chartType === "donut" ? " db-chart-frame--donut" : " db-chart-frame--cartesian"}`}>
          {chartType === "donut" ? (
            <DonutChartPanel
              data={chartData}
              total={total}
              metricLabel={valueLabel}
              showLegend={view.chartShowLegend ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={compactPixelWidth}
              compactPixelHeight={compactPixelHeight}
            />
          ) : chartType === "line" ? (
            <LineChartPanel
              data={chartData}
              metricLabel={valueLabel}
              gradientId={gradientId}
              showGrid={view.chartShowGrid ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={compactPixelWidth}
              compactPixelHeight={compactPixelHeight}
            />
          ) : (
            <BarChartPanel
              data={chartData}
              metricLabel={valueLabel}
              showGrid={view.chartShowGrid ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={compactPixelWidth}
              compactPixelHeight={compactPixelHeight}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BarChartPanel({
  data,
  metricLabel,
  showGrid,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  metricLabel: string;
  showGrid: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
}) {
  const metrics = getCompactCartesianMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    compactPixelWidth,
    compactPixelHeight,
  );

  return (
    <div className={`db-chart-panel db-chart-panel--cartesian${compact ? " db-chart-panel--embedded" : ""}`}>
      <div className="db-chart-recharts db-chart-recharts--cartesian" style={getChartFrameStyle(metrics.width, metrics.height)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={metrics.padding} barCategoryGap={compact ? "40%" : "28%"}>
            {showGrid ? <CartesianGrid vertical={false} stroke="var(--db-chart-grid)" strokeDasharray="3 6" /> : null}
            <XAxis
              dataKey="label"
              axisLine={{ stroke: "var(--db-chart-axis)" }}
              tickLine={false}
              tickMargin={12}
              minTickGap={12}
              interval="preserveStartEnd"
              tick={{ fontSize: 10, fill: "var(--db-chart-axis-label)" }}
              tickFormatter={(value) => truncateLabel(String(value), compact ? 10 : 12)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={Math.max(metrics.padding.left - 10, 36)}
              tick={{ fontSize: 10, fill: "var(--db-chart-axis-label)" }}
              tickFormatter={formatTick}
            />
            <Tooltip
              cursor={{ fill: "var(--db-chart-cursor)" }}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 3, outline: "none" }}
              content={(props) => <ChartTooltipCard {...props} metricLabel={metricLabel} />}
            />
            <Bar
              dataKey="value"
              radius={[0, 0, 0, 0]}
              maxBarSize={compact ? 18 : 26}
              isAnimationActive
              animationDuration={560}
              animationBegin={60}
            >
              {data.map((datum) => (
                <Cell key={datum.key} fill={datum.color} stroke="color-mix(in srgb, var(--crust) 24%, transparent 76%)" strokeWidth={1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LineChartPanel({
  data,
  metricLabel,
  gradientId,
  showGrid,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  metricLabel: string;
  gradientId: string;
  showGrid: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
}) {
  const metrics = getCompactCartesianMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    compactPixelWidth,
    compactPixelHeight,
  );
  const lineColor = data[0]?.color ?? "var(--accent)";

  return (
    <div className={`db-chart-panel db-chart-panel--cartesian${compact ? " db-chart-panel--embedded" : ""}`}>
      <div className="db-chart-recharts db-chart-recharts--cartesian" style={getChartFrameStyle(metrics.width, metrics.height)}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={metrics.padding}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.34} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            {showGrid ? <CartesianGrid vertical={false} stroke="var(--db-chart-grid)" strokeDasharray="3 6" /> : null}
            <XAxis
              dataKey="label"
              axisLine={{ stroke: "var(--db-chart-axis)" }}
              tickLine={false}
              tickMargin={12}
              minTickGap={12}
              interval="preserveStartEnd"
              tick={{ fontSize: 10, fill: "var(--db-chart-axis-label)" }}
              tickFormatter={(value) => truncateLabel(String(value), compact ? 10 : 12)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={Math.max(metrics.padding.left - 10, 36)}
              tick={{ fontSize: 10, fill: "var(--db-chart-axis-label)" }}
              tickFormatter={formatTick}
            />
            <Tooltip
              cursor={{ stroke: "var(--db-chart-axis)", strokeDasharray: "4 6", strokeOpacity: 0.8 }}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 3, outline: "none" }}
              content={(props) => <ChartTooltipCard {...props} metricLabel={metricLabel} />}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill={`url(#${gradientId})`}
              isAnimationActive
              animationDuration={700}
              animationBegin={40}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={3}
              dot={{ r: 4, fill: lineColor, stroke: "var(--db-chart-panel-edge)", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: lineColor, stroke: "var(--base)", strokeWidth: 2 }}
              isAnimationActive
              animationDuration={700}
              animationBegin={40}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DonutChartPanel({
  data,
  total,
  metricLabel,
  showLegend,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  total: number;
  metricLabel: string;
  showLegend: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
}) {
  const config = getDonutChartMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    showLegend,
    compactPixelWidth,
    compactPixelHeight,
    data.length,
  );
  const layoutClass =
    config.legendPlacement === "side"
      ? " db-chart-donut-layout--side"
      : config.legendPlacement === "below"
        ? " db-chart-donut-layout--stacked"
        : "";
  const compactClass = compact ? " db-chart-donut-layout--compact" : "";

  return (
    <div className={`db-chart-donut-layout${layoutClass}${compactClass}`}>
      <div
        className={`db-chart-panel db-chart-panel--donut${compact ? " db-chart-panel--embedded" : ""}`}
        style={getFixedChartFrameStyle(config.width, config.height)}
      >
        <div className="db-chart-donut-chart-shell" style={getFixedChartFrameStyle(config.width, config.height)}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 3, outline: "none" }}
                content={(props) => (
                  <ChartTooltipCard
                    {...props}
                    metricLabel={metricLabel}
                    detailFormatter={(datum) => formatShare(datum.value, total)}
                  />
                )}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={config.innerRadius}
                outerRadius={config.outerRadius}
                paddingAngle={1}
                cornerRadius={3}
                stroke="none"
                strokeWidth={0}
                isAnimationActive
                animationDuration={680}
                animationBegin={80}
              >
                {data.map((datum) => (
                  <Cell key={datum.key} fill={datum.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="db-chart-donut-center" aria-hidden>
            <div className="db-chart-donut-total-text">{formatAggregateValue(total)}</div>
            <div className="db-chart-donut-center-caption">Total</div>
          </div>
        </div>
      </div>

      {config.showLegend ? (
        <div className="db-chart-legend">
          {data.map((datum) => (
            <div key={datum.key} className="db-chart-legend-row">
              <span aria-hidden className="db-chart-legend-swatch" style={{ backgroundColor: datum.color }} />
              <span className="db-chart-legend-label">{datum.label}</span>
              <span className="db-chart-legend-value">{formatAggregateValue(datum.value)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChartTooltipCard({
  active,
  payload,
  metricLabel,
  detailFormatter,
}: TooltipContentProps & {
  metricLabel: string;
  detailFormatter?: (datum: ChartDatum) => string | undefined;
}) {
  const datum = payload?.[0]?.payload as ChartDatum | undefined;
  if (!active || !datum) return null;

  return (
    <div className="db-chart-tooltip-card">
      <div className="db-chart-tooltip-title">
        <span aria-hidden className="db-chart-tooltip-swatch" style={{ backgroundColor: datum.color }} />
        <span className="db-chart-tooltip-label">{datum.label}</span>
      </div>
      <div className="db-chart-tooltip-row">
        <span className="db-chart-tooltip-metric">{metricLabel}</span>
        <span className="db-chart-tooltip-value">{formatAggregateValue(datum.value)}</span>
      </div>
      {detailFormatter ? <div className="db-chart-tooltip-detail">{detailFormatter(datum)}</div> : null}
    </div>
  );
}

function buildChartData(
  records: WorkspaceDatabaseRecordModel[],
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
  groupField: WorkspaceDatabaseField | undefined,
  valueField: WorkspaceDatabaseField | undefined,
  aggregation: WorkspaceDatabaseChartAggregation,
  chartType: WorkspaceDatabaseModel["views"][number]["chartType"],
) {
  if (!groupField) return [];

  const buckets = new Map<string, { label: string; values: number[]; count: number }>();

  for (const record of records) {
    const groups = getBucketEntries(record, groupField, database, catalog);
    if (groups.length === 0) continue;
    const numericValue = valueField ? getNumericValue(record, valueField, database, catalog) : null;

    for (const group of groups) {
      const existing = buckets.get(group.key) ?? { label: group.label, values: [], count: 0 };
      existing.count += 1;
      if (numericValue !== null) {
        existing.values.push(numericValue);
      }
      buckets.set(group.key, existing);
    }
  }

  const data = [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      value: aggregateBucket(bucket, aggregation),
    }))
    .filter((datum) => Number.isFinite(datum.value) && datum.value > 0);

  if (groupField.type === "date" || chartType === "line") {
    return data.sort((left, right) => compareChartKeys(left.key, right.key));
  }

  return data.sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function filterChartRecords(
  records: WorkspaceDatabaseRecordModel[],
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
  groupField: WorkspaceDatabaseField | undefined,
  chartType: WorkspaceDatabaseModel["views"][number]["chartType"],
  chartRange: WorkspaceDatabaseChartRange,
) {
  if (chartType !== "line" || chartRange === "all" || !groupField) {
    return records;
  }

  const cutoff = getChartRangeCutoff(chartRange);
  if (!cutoff) return records;

  return records.filter((record) => {
    const value = getFieldValue(record, groupField, database, catalog);
    if (typeof value !== "string") return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && time >= cutoff;
  });
}

function aggregateBucket(
  bucket: { values: number[]; count: number },
  aggregation: WorkspaceDatabaseChartAggregation,
) {
  if (aggregation === "count") return bucket.count;
  if (!bucket.values.length) return 0;

  switch (aggregation) {
    case "sum":
      return bucket.values.reduce((sum, value) => sum + value, 0);
    case "avg":
      return bucket.values.reduce((sum, value) => sum + value, 0) / bucket.values.length;
    case "min":
      return Math.min(...bucket.values);
    case "max":
      return Math.max(...bucket.values);
    default:
      return bucket.count;
  }
}

function getNumericValue(
  record: WorkspaceDatabaseRecordModel,
  field: WorkspaceDatabaseField,
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
) {
  const value = getFieldValue(record, field, database, catalog);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getBucketEntries(
  record: WorkspaceDatabaseRecordModel,
  field: WorkspaceDatabaseField,
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
) {
  const value = getFieldValue(record, field, database, catalog);
  if (value === null || value === undefined || value === "") {
    return [{ key: "__empty__", label: "No value" }];
  }

  if (field.type === "checkbox") {
    return [{ key: value ? "true" : "false", label: value ? "Checked" : "Unchecked" }];
  }

  if (field.type === "date" && typeof value === "string") {
    const key = value.slice(0, 10);
    return [{ key, label: formatDate(key) }];
  }

  if (field.type === "relation" && Array.isArray(value)) {
    if (!value.length) return [{ key: "__empty__", label: "No value" }];
    return value.map((relationId) => ({
      key: String(relationId),
      label: resolveRelationLabel(field, String(relationId), catalog),
    }));
  }

  if (Array.isArray(value)) {
    if (!value.length) return [{ key: "__empty__", label: "No value" }];
    return value.map((entry) => ({ key: String(entry), label: String(entry) }));
  }

  return [{ key: String(value), label: String(value) }];
}

function compareChartKeys(left: string, right: string) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function getChartFrameStyle(width: number, height: number) {
  return {
    width: "100%",
    maxWidth: `${width}px`,
    height: `${height}px`,
  };
}

function getFixedChartFrameStyle(width: number, height: number) {
  return {
    width: `${width}px`,
    maxWidth: "100%",
    height: `${height}px`,
  };
}

function getChartThemeStyle(theme: ChartTheme) {
  return {
    "--db-chart-primary": theme.primary,
    "--db-chart-secondary": theme.secondary,
    "--db-chart-panel-edge": theme.panelEdge,
    "--db-chart-grid": theme.grid,
    "--db-chart-axis": theme.axis,
    "--db-chart-axis-label": theme.axisLabel,
    "--db-chart-cursor": theme.cursor,
    "--db-chart-tooltip-border": theme.tooltipBorder,
    "--db-chart-tooltip-shadow": theme.tooltipShadow,
    "--db-chart-legend-hover": theme.legendHover,
  } as CSSProperties;
}

function getCompactCartesianMetrics(
  compact: boolean | undefined,
  compactWidthUnits: number | undefined,
  compactHeightUnits: number | undefined,
  compactPixelWidth: number | undefined,
  compactPixelHeight: number | undefined,
) {
  if (!compact) {
    return {
      width: 680,
      height: 292,
      padding: { top: 20, right: 18, bottom: 70, left: 52 },
    };
  }

  const widthUnits = compactWidthUnits ?? 0;
  const heightUnits = compactHeightUnits ?? 0;
  const pixelWidth = compactPixelWidth ?? 0;
  const pixelHeight = compactPixelHeight ?? 0;

  if (pixelWidth > 0 && pixelHeight > 0) {
    const width = clamp(pixelWidth - 28, 280, 760);
    const height = clamp(pixelHeight - 18, 190, 312);
    const bottom = width < 420 ? 52 : width < 560 ? 58 : 64;
    const left = width < 420 ? 40 : width < 560 ? 46 : 52;
    const right = width < 420 ? 12 : 18;
    return {
      width,
      height,
      padding: { top: 18, right, bottom, left },
    };
  }

  if (widthUnits <= 4) {
    return {
      width: 320,
      height: heightUnits >= 12 ? 236 : 212,
      padding: { top: 16, right: 12, bottom: 48, left: 38 },
    };
  }

  if (widthUnits <= 6) {
    return {
      width: 480,
      height: heightUnits >= 12 ? 260 : 232,
      padding: { top: 18, right: 16, bottom: 56, left: 44 },
    };
  }

  return {
    width: 700,
    height: heightUnits >= 12 ? 296 : 272,
    padding: { top: 20, right: 18, bottom: 66, left: 52 },
  };
}

function getDonutChartMetrics(
  compact: boolean | undefined,
  compactWidthUnits: number | undefined,
  compactHeightUnits: number | undefined,
  showLegend: boolean,
  compactPixelWidth: number | undefined,
  compactPixelHeight: number | undefined,
  itemCount: number,
) {
  if (!compact) {
    return {
      width: 760,
      height: 340,
      innerRadius: 68,
      outerRadius: 112,
      showLegend,
      legendPlacement: "side" as const,
    };
  }

  const widthUnits = compactWidthUnits ?? 0;
  const heightUnits = compactHeightUnits ?? 0;
  const pixelWidth = compactPixelWidth ?? 0;
  const pixelHeight = compactPixelHeight ?? 0;

  if (pixelWidth > 0 && pixelHeight > 0) {
    const availableWidth = Math.max(pixelWidth - 16, 240);
    const availableHeight = Math.max(pixelHeight - 12, 190);
    const canShowSideLegend =
      showLegend &&
      availableWidth >= 480 &&
      availableHeight >= 220 &&
      availableWidth / Math.max(availableHeight, 1) >= 1.22;

    if (canShowSideLegend) {
      const legendWidth = clamp(Math.round(availableWidth * 0.24), 160, 210);
      const chartWidth = availableWidth - legendWidth - 16;
      const diameter = clamp(Math.min(chartWidth * 0.9, availableHeight * 0.78), 132, 286);
      const outerRadius = Math.floor(diameter / 2);
      return {
        width: diameter + 24,
        height: diameter + 24,
        innerRadius: Math.max(Math.floor(outerRadius * 0.62), 44),
        outerRadius,
        showLegend,
        legendPlacement: "side" as const,
      };
    }

    const stackedColumns = availableWidth >= 300 ? 2 : 1;
    const legendRows = showLegend ? Math.ceil(itemCount / stackedColumns) : 0;
    const legendBlockHeight = showLegend ? legendRows * 30 + Math.max(legendRows - 1, 0) * 8 + 12 : 0;
    const chartHeight = availableHeight - legendBlockHeight - (showLegend ? 10 : 0);
    const diameter = clamp(Math.min(availableWidth * 0.64, chartHeight * 0.84), 108, 248);
    const outerRadius = Math.floor(diameter / 2);
    return {
      width: diameter + 24,
      height: diameter + 24,
      innerRadius: Math.max(Math.floor(outerRadius * 0.62), 42),
      outerRadius,
      showLegend,
      legendPlacement: showLegend ? ("below" as const) : ("hidden" as const),
    };
  }

  const canShowSideLegend = showLegend && widthUnits >= 6;
  const renderLegend = showLegend;

  if (canShowSideLegend) {
    const outerRadius = widthUnits >= 9 ? 122 : 112;
    return {
      width: widthUnits >= 9 ? 720 : 640,
      height: heightUnits >= 13 ? 360 : 326,
      innerRadius: widthUnits >= 9 ? 76 : 68,
      outerRadius,
      showLegend: true,
      legendPlacement: "side" as const,
    };
  }

  return {
    width: 480,
    height: renderLegend ? (heightUnits >= 12 ? 368 : 328) : 336,
    innerRadius: renderLegend ? (heightUnits >= 12 ? 68 : 64) : 72,
    outerRadius: renderLegend ? (heightUnits >= 12 ? 112 : 104) : 118,
    showLegend: renderLegend,
    legendPlacement: renderLegend ? ("below" as const) : ("hidden" as const),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatTick(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return formatAggregateValue(value);
}

function truncateLabel(value: string, max = 12) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatAggregateValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatShare(value: number, total: number) {
  if (total <= 0) return undefined;
  const percent = (value / total) * 100;
  return `${percent.toFixed(percent >= 10 ? 0 : 1)}% of total`;
}

function formatChartRangeLabel(range: WorkspaceDatabaseChartRange) {
  switch (range) {
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    case "365d":
      return "Last year";
    default:
      return "All time";
  }
}

function getChartRangeCutoff(range: WorkspaceDatabaseChartRange) {
  const days = range === "30d" ? 30 : range === "90d" ? 90 : range === "365d" ? 365 : 0;
  if (!days) return null;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.getTime();
}
