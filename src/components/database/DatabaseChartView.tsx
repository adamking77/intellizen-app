import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/empty-state";
import {
  findDefaultChartGroupField,
  findDefaultChartValueField,
  getFieldValue,
  getChartGroupCandidates,
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
  detail?: string;
}

interface ChartTooltipEntry {
  color?: string;
  payload?: ChartDatum;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly ChartTooltipEntry[];
}

type CartesianWidthTier = 0 | 1 | 2 | 3 | 4;

const CHART_PALETTES: Record<WorkspaceDatabaseChartPalette, string[]> = {
  blue: [
    "var(--accent)",
    "var(--lavender)",
    "var(--sapphire)",
    "var(--teal)",
    "var(--sky)",
    "var(--blue)",
    "var(--mauve)",
    "var(--green)",
  ],
  rose: [
    "var(--flamingo)",
    "var(--rosewater)",
    "var(--pink)",
    "var(--lavender)",
    "var(--mauve)",
    "var(--yellow)",
    "var(--peach)",
    "var(--red)",
  ],
  gold: [
    "var(--yellow)",
    "var(--peach)",
    "var(--rosewater)",
    "var(--flamingo)",
    "var(--rosewater)",
    "var(--red)",
    "var(--maroon)",
    "var(--flamingo)",
  ],
  teal: [
    "var(--sky)",
    "var(--teal)",
    "var(--sapphire)",
    "var(--green)",
    "var(--accent)",
    "var(--lavender)",
    "var(--mauve)",
    "var(--blue)",
  ],
};

const CHART_FRAME_SNAP_PX = 12;
const DONUT_SIDE_ENTER_MIN_WIDTH = 520;
const DONUT_SIDE_ENTER_MIN_HEIGHT = 220;
const DONUT_SIDE_ENTER_MIN_RATIO = 1.35;
const DONUT_SIDE_EXIT_MIN_WIDTH = 488;
const DONUT_SIDE_EXIT_MIN_HEIGHT = 208;
const DONUT_SIDE_EXIT_MIN_RATIO = 1.27;
const CARTESIAN_TIER_ENTER_WIDTHS = [180, 280, 420, 560] as const;
const CARTESIAN_TIER_EXIT_WIDTHS = [168, 264, 396, 528] as const;
const CHART_TOOLTIP_WRAPPER_STYLE = {
  zIndex: 3,
  outline: "none",
  pointerEvents: "none",
  transition: "transform 390ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease-out",
  willChange: "transform, opacity",
} satisfies CSSProperties;

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
  const [frameRef, frameSize] = useMeasuredElementSize<HTMLDivElement>();
  const cartesianWidthTier = useStableCartesianWidthTier(
    compact,
    compactWidthUnits,
    frameSize.width || compactPixelWidth,
  );
  const chartType = view.chartType ?? "bar";
  const chartRange = view.chartRange ?? "90d";
  const aggregation = view.chartAggregation ?? "count";
  const palette = CHART_PALETTES[view.chartPalette ?? "blue"];
  const groupField = database.schema.find((field) => field.id === view.groupBy) ?? findDefaultChartGroupField(database, chartType);
  const valueField = database.schema.find((field) => field.id === view.chartValueField) ?? findDefaultChartValueField(database);
  const isValidGroupField = groupField
    ? getChartGroupCandidates(database, chartType).some((field) => field.id === groupField.id)
    : false;
  const records = useMemo(() => getViewRecords(database, view, catalog), [catalog, database, view]);
  const chartRecords = useMemo(
    () => filterChartRecords(records, database, catalog, groupField, chartType, chartRange),
    [catalog, chartRange, chartType, database, groupField, records],
  );
  const chartData = useMemo(
    () => buildChartData(chartRecords, database, catalog, groupField, valueField, aggregation, chartType),
    [aggregation, catalog, chartRecords, chartType, database, groupField, valueField],
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
  const summaryLabel = aggregation === "count"
    ? `${total} records`
    : `${formatAggregateValue(total)} ${aggregation}`;
  const valueLabel = aggregation === "count"
    ? "Count records"
    : `${capitalize(aggregation)} ${valueField?.name ?? "value"}`;
  const chartContextLabel =
    chartType === "line" ? `${chartData.length} points` : `${chartData.length} groups`;
  const rangeLabel = chartType === "line" ? formatChartRangeLabel(chartRange) : null;
  const captionParts = [`${valueLabel} by ${groupField.name}`, chartContextLabel, rangeLabel].filter(Boolean);
  const labelByKey = useMemo(
    () => new Map(chartData.map((datum) => [datum.key, datum.label])),
    [chartData],
  );
  const seriesData = useMemo(
    () => chartData.map((datum, index) => ({
      ...datum,
      color: chartType === "line" ? palette[0] : palette[index % palette.length],
      detail: chartType === "donut" ? formatShare(datum.value, total) : undefined,
    })),
    [chartData, chartType, palette, total],
  );

  return (
    <div className={`db-chart-root${compact ? " db-chart-root--compact" : ""}`}>
      {!compact ? (
        <div className="db-chart-header">
          <div className="db-chart-meta">
            <span className="db-chart-summary">{summaryLabel}</span>
            <span className="db-chart-caption">{captionParts.join(" · ")}</span>
          </div>
        </div>
      ) : null}

      <div className="db-chart-surface">
        <div
          ref={frameRef}
          className={`db-chart-frame${chartType === "donut" ? " db-chart-frame--donut" : " db-chart-frame--cartesian"}`}
        >
          {chartType === "donut" ? (
            <DonutChart
              data={seriesData}
              total={total}
              metricLabel={valueLabel}
              showLegend={view.chartShowLegend ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={frameSize.width || compactPixelWidth}
              compactPixelHeight={frameSize.height || compactPixelHeight}
            />
          ) : chartType === "line" ? (
            <LineChartCard
              data={seriesData}
              metricLabel={valueLabel}
              labelByKey={labelByKey}
              showGrid={view.chartShowGrid ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactWidthTier={cartesianWidthTier}
              compactPixelWidth={frameSize.width || compactPixelWidth}
              compactPixelHeight={frameSize.height || compactPixelHeight}
            />
          ) : (
            <BarChartCard
              data={seriesData}
              metricLabel={valueLabel}
              labelByKey={labelByKey}
              showGrid={view.chartShowGrid ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={frameSize.width || compactPixelWidth}
              compactPixelHeight={frameSize.height || compactPixelHeight}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BarChartCard({
  data,
  metricLabel,
  labelByKey,
  showGrid,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactWidthTier,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  metricLabel: string;
  labelByKey: Map<string, string>;
  showGrid: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactWidthTier?: CartesianWidthTier;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
}) {
  const metrics = getCartesianChartMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    compactWidthTier,
    compactPixelWidth,
    compactPixelHeight,
  );
  const tickInterval = Math.max(0, getAxisLabelStep(data.length) - 1);

  return (
    <div className="db-chart-canvas" style={{ height: `${metrics.height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={metrics.margin} barCategoryGap={compact ? "26%" : "30%"}>
          {showGrid ? <CartesianGrid vertical={false} stroke="var(--border-subtle)" className="db-chart-grid" /> : null}
          <XAxis
            dataKey="key"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--overlay-1)", fontSize: 10 }}
            tickMargin={12}
            interval={tickInterval}
            minTickGap={compact ? 10 : 16}
            tickFormatter={(key) => truncateLabel(labelByKey.get(String(key)) ?? String(key))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--overlay-1)", fontSize: 10 }}
            tickMargin={8}
            width={Math.max(metrics.margin.left - 8, 28)}
            tickFormatter={(value) => formatTick(typeof value === "number" ? value : Number(value))}
          />
          <Tooltip
            cursor={false}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            content={(props) => <ChartTooltipCard {...props} metricLabel={metricLabel} />}
          />
          <Bar
            dataKey="value"
            radius={[metrics.barRadius, metrics.barRadius, 0, 0]}
            maxBarSize={metrics.maxBarSize}
            isAnimationActive={false}
          >
            {data.map((datum) => (
              <Cell key={datum.key} className="db-chart-bar" fill={datum.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LineChartCard({
  data,
  metricLabel,
  labelByKey,
  showGrid,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactWidthTier,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  metricLabel: string;
  labelByKey: Map<string, string>;
  showGrid: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactWidthTier?: CartesianWidthTier;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
}) {
  const metrics = getCartesianChartMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    compactWidthTier,
    compactPixelWidth,
    compactPixelHeight,
  );
  const gradientId = useId();
  const lineColor = data[0]?.color ?? "var(--accent)";
  const tickInterval = Math.max(0, getAxisLabelStep(data.length) - 1);

  return (
    <div className="db-chart-canvas" style={{ height: `${metrics.height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={metrics.margin}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {showGrid ? <CartesianGrid vertical={false} stroke="var(--border-subtle)" className="db-chart-grid" /> : null}
          <XAxis
            dataKey="key"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--overlay-1)", fontSize: 10 }}
            tickMargin={12}
            interval={tickInterval}
            minTickGap={compact ? 10 : 16}
            tickFormatter={(key) => truncateLabel(labelByKey.get(String(key)) ?? String(key))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--overlay-1)", fontSize: 10 }}
            tickMargin={8}
            width={Math.max(metrics.margin.left - 8, 28)}
            tickFormatter={(value) => formatTick(typeof value === "number" ? value : Number(value))}
          />
          <Tooltip
            cursor={false}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            content={(props) => <ChartTooltipCard {...props} metricLabel={metricLabel} />}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={3}
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            isAnimationActive={false}
            dot={{
              r: 4,
              fill: lineColor,
              stroke: "var(--mantle)",
              strokeWidth: 2,
              className: "db-chart-point",
            }}
            activeDot={{
              r: 5,
              fill: lineColor,
              stroke: "var(--mantle)",
              strokeWidth: 2,
              className: "db-chart-point",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({
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
  const legendPlacement = useStableDonutLegendPlacement(
    compact,
    showLegend,
    compactWidthUnits,
    compactPixelWidth,
    compactPixelHeight,
  );
  const config = getDonutChartMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    showLegend,
    legendPlacement,
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
  const canvasStyle = {
    width: `${config.chartWidth}px`,
    height: `${config.height}px`,
  } satisfies CSSProperties;

  return (
    <div className={`db-chart-donut-layout${layoutClass}${compactClass}`}>
      <div className="db-chart-donut-canvas" style={canvasStyle}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Tooltip
              cursor={false}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              content={(props) => <ChartTooltipCard {...props} metricLabel={metricLabel} />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius={config.innerRadius}
              outerRadius={config.outerRadius}
              paddingAngle={data.length > 1 ? 1.2 : 0}
              cornerRadius={3}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((datum) => (
                <Cell key={datum.key} className="db-chart-donut-segment" fill={datum.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="db-chart-donut-center">
          <div className="db-chart-donut-total">{formatAggregateValue(total)}</div>
          <div className="db-chart-donut-caption">Total</div>
        </div>
      </div>

      {config.showLegend ? (
        <div className="db-chart-legend">
          {data.map((datum) => (
            <div key={datum.key} className="db-chart-legend-row">
              <span
                aria-hidden
                className="db-chart-legend-swatch"
                style={{ backgroundColor: datum.color }}
              />
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
}: ChartTooltipProps & {
  metricLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const datum = entry.payload;
  if (!datum) return null;
  const color = entry.color ?? datum.color ?? "var(--accent)";

  return (
    <div className="db-chart-tooltip">
      <div className="db-chart-tooltip-title">
        <span
          aria-hidden
          className="db-chart-tooltip-swatch"
          style={{ backgroundColor: color }}
        />
        <span className="db-chart-tooltip-label">{datum.label}</span>
      </div>
      <div className="db-chart-tooltip-row">
        <span className="db-chart-tooltip-metric">{metricLabel}</span>
        <span className="db-chart-tooltip-value">{formatAggregateValue(datum.value)}</span>
      </div>
      {datum.detail ? <div className="db-chart-tooltip-detail">{datum.detail}</div> : null}
    </div>
  );
}

function useMeasuredElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let frameId = 0;

    const update = (width: number, height: number) => {
      const nextWidth = snapChartFrameSize(width);
      const nextHeight = snapChartFrameSize(height);
      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    update(node.clientWidth, node.clientHeight);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        update(entry.contentRect.width, entry.contentRect.height);
      });
    });

    observer.observe(node);
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, []);

  return [ref, size] as const;
}

function useStableDonutLegendPlacement(
  compact: boolean | undefined,
  showLegend: boolean,
  compactWidthUnits: number | undefined,
  compactPixelWidth: number | undefined,
  compactPixelHeight: number | undefined,
) {
  const [placement, setPlacement] = useState<"side" | "below" | "hidden">(() =>
    getDonutLegendPlacement(
      compact,
      showLegend,
      compactWidthUnits,
      compactPixelWidth,
      compactPixelHeight,
      null,
    ),
  );

  useLayoutEffect(() => {
    const nextPlacement = getDonutLegendPlacement(
      compact,
      showLegend,
      compactWidthUnits,
      compactPixelWidth,
      compactPixelHeight,
      placement,
    );
    if (nextPlacement !== placement) {
      setPlacement(nextPlacement);
    }
  }, [compact, compactPixelHeight, compactPixelWidth, compactWidthUnits, placement, showLegend]);

  return placement;
}

function useStableCartesianWidthTier(
  compact: boolean | undefined,
  compactWidthUnits: number | undefined,
  compactPixelWidth: number | undefined,
) {
  const [tier, setTier] = useState<CartesianWidthTier>(() =>
    getCartesianWidthTier(compact, compactWidthUnits, compactPixelWidth, null),
  );

  useLayoutEffect(() => {
    const nextTier = getCartesianWidthTier(compact, compactWidthUnits, compactPixelWidth, tier);
    if (nextTier !== tier) {
      setTier(nextTier);
    }
  }, [compact, compactPixelWidth, compactWidthUnits, tier]);

  return tier;
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

function formatAggregateValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCartesianChartMetrics(
  compact: boolean | undefined,
  compactWidthUnits: number | undefined,
  compactHeightUnits: number | undefined,
  compactWidthTier: CartesianWidthTier | undefined,
  compactPixelWidth: number | undefined,
  compactPixelHeight: number | undefined,
) {
  if (!compact) {
    return {
      height: 292,
      margin: { top: 20, right: 18, bottom: 20, left: 8 },
      maxBarSize: 32,
      barRadius: 5,
    };
  }

  const widthUnits = compactWidthUnits ?? 0;
  const heightUnits = compactHeightUnits ?? 0;
  const pixelWidth = compactPixelWidth ?? 0;
  const pixelHeight = compactPixelHeight ?? 0;

  if (pixelWidth > 0 && pixelHeight > 0) {
    const height = clamp(pixelHeight - 16, 136, 312);
    const widthTier = compactWidthTier ?? getCartesianWidthTier(compact, compactWidthUnits, pixelWidth, null);
    const left = widthTier === 0 ? 4 : widthTier === 1 ? 8 : widthTier === 2 ? 12 : 16;
    const right = widthTier === 0 ? 4 : widthTier === 1 ? 8 : widthTier === 2 ? 10 : 14;
    const compactBarScale = getCompactBarScale(compact, compactWidthUnits, compactPixelWidth);
    return {
      height,
      margin: { top: 18, right, bottom: 12, left },
      maxBarSize: Math.max(16, Math.round((36 * compactBarScale) / 2) * 2),
      barRadius: 4,
    };
  }

  if (widthUnits <= 4) {
    return {
      height: heightUnits >= 12 ? 278 : 246,
      margin: { top: 18, right: 8, bottom: 12, left: 6 },
      maxBarSize: 20,
      barRadius: 4,
    };
  }

  if (widthUnits <= 7) {
    return {
      height: heightUnits >= 12 ? 286 : 258,
      margin: { top: 18, right: 10, bottom: 12, left: 8 },
      maxBarSize: 24,
      barRadius: 4,
    };
  }

  return {
    height: heightUnits >= 12 ? 296 : 272,
    margin: { top: 20, right: 14, bottom: 12, left: 10 },
    maxBarSize: 28,
    barRadius: 4,
  };
}

function getCartesianWidthTier(
  compact: boolean | undefined,
  compactWidthUnits: number | undefined,
  compactPixelWidth: number | undefined,
  currentTier: CartesianWidthTier | null,
): CartesianWidthTier {
  if (!compact) return 4;

  const pixelWidth = compactPixelWidth ?? 0;
  if (pixelWidth > 0) {
    const width = clamp(pixelWidth - 24, 96, 760);
    if (currentTier === null) {
      if (width < CARTESIAN_TIER_ENTER_WIDTHS[0]) return 0;
      if (width < CARTESIAN_TIER_ENTER_WIDTHS[1]) return 1;
      if (width < CARTESIAN_TIER_ENTER_WIDTHS[2]) return 2;
      if (width < CARTESIAN_TIER_ENTER_WIDTHS[3]) return 3;
      return 4;
    }

    if (currentTier === 0) {
      return width >= CARTESIAN_TIER_ENTER_WIDTHS[0] ? 1 : 0;
    }
    if (currentTier === 1) {
      if (width < CARTESIAN_TIER_EXIT_WIDTHS[0]) return 0;
      if (width >= CARTESIAN_TIER_ENTER_WIDTHS[1]) return 2;
      return 1;
    }
    if (currentTier === 2) {
      if (width < CARTESIAN_TIER_EXIT_WIDTHS[1]) return 1;
      if (width >= CARTESIAN_TIER_ENTER_WIDTHS[2]) return 3;
      return 2;
    }
    if (currentTier === 3) {
      if (width < CARTESIAN_TIER_EXIT_WIDTHS[2]) return 2;
      if (width >= CARTESIAN_TIER_ENTER_WIDTHS[3]) return 4;
      return 3;
    }
    return width < CARTESIAN_TIER_EXIT_WIDTHS[3] ? 3 : 4;
  }

  const widthUnits = compactWidthUnits ?? 0;
  if (widthUnits <= 4) return 1;
  if (widthUnits <= 7) return 2;
  return 4;
}

function getDonutChartMetrics(
  compact: boolean | undefined,
  compactWidthUnits: number | undefined,
  compactHeightUnits: number | undefined,
  showLegend: boolean,
  legendPlacement: "side" | "below" | "hidden",
  compactPixelWidth: number | undefined,
  compactPixelHeight: number | undefined,
  itemCount: number,
) {
  if (!compact) {
    return {
      chartWidth: 300,
      height: 300,
      outerRadius: 92,
      innerRadius: getDonutInnerRadius(92),
      showLegend,
      legendPlacement: "side" as const,
    };
  }

  const widthUnits = compactWidthUnits ?? 0;
  const heightUnits = compactHeightUnits ?? 0;
  const pixelWidth = compactPixelWidth ?? 0;
  const pixelHeight = compactPixelHeight ?? 0;

  if (pixelWidth > 0 && pixelHeight > 0) {
    const availableWidth = Math.max(pixelWidth - 16, 116);
    const availableHeight = Math.max(pixelHeight - 12, 140);
    if (legendPlacement === "side") {
      const legendWidth = clamp(Math.round(availableWidth * 0.24), 160, 210);
      const chartWidth = availableWidth - legendWidth - 16;
      const diameter = clamp(
        Math.min(chartWidth * 0.9, availableHeight * 0.78),
        132,
        286,
      );
      const outerRadius = Math.floor(diameter / 2);
      return {
        chartWidth: diameter + 24,
        height: diameter + 24,
        outerRadius,
        innerRadius: getDonutInnerRadius(outerRadius, 44),
        showLegend,
        legendPlacement: "side" as const,
      };
    }

    const stackedColumns = availableWidth >= 300 ? 2 : 1;
    const legendRows = showLegend ? Math.ceil(itemCount / stackedColumns) : 0;
    const legendBlockHeight = showLegend
      ? legendRows * 30 + Math.max(legendRows - 1, 0) * 8 + 12
      : 0;
    const chartHeight = availableHeight - legendBlockHeight - (showLegend ? 10 : 0);
    const diameter = clamp(
      Math.min(availableWidth * 0.64, chartHeight * 0.84),
      72,
      248,
    );
    const outerRadius = Math.floor(diameter / 2);
    return {
      chartWidth: diameter + 24,
      height: diameter + 24,
      outerRadius,
      innerRadius: getDonutInnerRadius(outerRadius, 42),
      showLegend,
      legendPlacement,
    };
  }

  const canShowSideLegend = legendPlacement === "side";
  const renderLegend = legendPlacement !== "hidden";

  if (canShowSideLegend) {
    const outerRadius = widthUnits >= 9 ? 122 : 112;
    return {
      chartWidth: outerRadius * 2 + 24,
      height: heightUnits >= 13 ? 360 : 326,
      outerRadius,
      innerRadius: getDonutInnerRadius(outerRadius),
      showLegend: true,
      legendPlacement: "side" as const,
    };
  }

  const outerRadius = renderLegend ? (heightUnits >= 12 ? 112 : 104) : 118;
  return {
    chartWidth: outerRadius * 2 + 24,
    height: outerRadius * 2 + 24,
    outerRadius,
    innerRadius: getDonutInnerRadius(outerRadius),
    showLegend: renderLegend,
    legendPlacement: renderLegend ? ("below" as const) : ("hidden" as const),
  };
}

function getDonutLegendPlacement(
  compact: boolean | undefined,
  showLegend: boolean,
  compactWidthUnits: number | undefined,
  compactPixelWidth: number | undefined,
  compactPixelHeight: number | undefined,
  currentPlacement: "side" | "below" | "hidden" | null,
) {
  if (!showLegend) return "hidden" as const;
  if (!compact) return "side" as const;

  const pixelWidth = compactPixelWidth ?? 0;
  const pixelHeight = compactPixelHeight ?? 0;

  if (pixelWidth > 0 && pixelHeight > 0) {
    const availableWidth = Math.max(pixelWidth - 16, 116);
    const availableHeight = Math.max(pixelHeight - 12, 140);
    const ratio = availableWidth / Math.max(availableHeight, 1);
    const isCurrentlySide = currentPlacement === "side";
    const minWidth = isCurrentlySide ? DONUT_SIDE_EXIT_MIN_WIDTH : DONUT_SIDE_ENTER_MIN_WIDTH;
    const minHeight = isCurrentlySide ? DONUT_SIDE_EXIT_MIN_HEIGHT : DONUT_SIDE_ENTER_MIN_HEIGHT;
    const minRatio = isCurrentlySide ? DONUT_SIDE_EXIT_MIN_RATIO : DONUT_SIDE_ENTER_MIN_RATIO;
    return availableWidth >= minWidth && availableHeight >= minHeight && ratio >= minRatio
      ? "side"
      : "below";
  }

  return (compactWidthUnits ?? 0) >= 9 ? "side" : "below";
}

function getDonutInnerRadius(outerRadius: number, minInnerRadius = 0) {
  return Math.max(Math.floor(outerRadius * 0.7), minInnerRadius);
}

function getCompactBarScale(
  compact: boolean | undefined,
  compactWidthUnits: number | undefined,
  compactPixelWidth: number | undefined,
) {
  if (!compact) return 1;

  const pixelWidth = compactPixelWidth ?? 0;
  if (pixelWidth > 0) {
    return clamp(pixelWidth / 680, 0.2, 0.82);
  }

  const widthUnits = compactWidthUnits ?? 0;
  if (widthUnits <= 4) return 0.52;
  if (widthUnits <= 7) return 0.66;
  return 0.78;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapChartFrameSize(value: number) {
  return Math.max(Math.round(value / CHART_FRAME_SNAP_PX) * CHART_FRAME_SNAP_PX, 0);
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

function getAxisLabelStep(length: number) {
  if (length > 20) return 4;
  if (length > 12) return 3;
  if (length > 8) return 2;
  return 1;
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
  const days =
    range === "30d" ? 30
      : range === "90d" ? 90
        : range === "365d" ? 365
          : 0;
  if (!days) return null;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.getTime();
}
