import { useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

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
}

interface ChartTooltipState {
  key: string;
  label: string;
  metric: string;
  value: string;
  detail?: string;
  color: string;
  x: number;
  y: number;
  locked: boolean;
  placement: "above" | "below";
}

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
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<ChartTooltipState | null>(null);
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
  const max = Math.max(...chartData.map((datum) => datum.value), 0);
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

  const positionTooltip = (event: ReactMouseEvent<SVGElement | HTMLDivElement>) => {
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect) return { x: 0, y: 0 };
    const inset = 28;
    return {
      x: clamp(event.clientX - frameRect.left, inset, frameRect.width - inset),
      y: clamp(event.clientY - frameRect.top, inset, frameRect.height - inset),
    };
  };

  const buildTooltipState = (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    options?: { locked?: boolean; detail?: string },
  ): ChartTooltipState => {
    const position = positionTooltip(event);
    return {
      key: datum.key,
      label: datum.label,
      metric: valueLabel,
      value: formatAggregateValue(datum.value),
      detail: options?.detail,
      color,
      x: position.x,
      y: position.y,
      locked: options?.locked ?? false,
      placement: position.y < 86 ? "below" : "above",
    };
  };

  const handleTooltipHover = (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => {
    setTooltip((current) => {
      if (current?.locked && current.key !== datum.key) return current;
      const next = buildTooltipState(event, datum, color, { detail, locked: current?.locked ?? false });
      return next;
    });
  };

  const handleTooltipLeave = () => {
    setTooltip((current) => (current?.locked ? current : null));
  };

  const handleTooltipToggle = (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => {
    event.stopPropagation();
    setTooltip((current) => {
      if (current?.locked && current.key === datum.key) {
        return null;
      }
      return buildTooltipState(event, datum, color, { detail, locked: true });
    });
  };

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
          onClick={() => setTooltip((current) => (current?.locked ? null : current))}
        >
          {tooltip ? (
            <div
              className={`db-chart-tooltip db-chart-tooltip--${tooltip.placement}${tooltip.locked ? " db-chart-tooltip--locked" : ""}`}
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className="db-chart-tooltip-title">
                <span
                  aria-hidden
                  className="db-chart-tooltip-swatch"
                  style={{ backgroundColor: tooltip.color }}
                />
                <span className="db-chart-tooltip-label">{tooltip.label}</span>
              </div>
              <div className="db-chart-tooltip-row">
                <span className="db-chart-tooltip-metric">{tooltip.metric}</span>
                <span className="db-chart-tooltip-value">{tooltip.value}</span>
              </div>
              {tooltip.detail ? <div className="db-chart-tooltip-detail">{tooltip.detail}</div> : null}
            </div>
          ) : null}
          {chartType === "donut" ? (
            <DonutChartSvg
              data={chartData}
              total={total}
              colors={palette}
              showLegend={view.chartShowLegend ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={compactPixelWidth}
              compactPixelHeight={compactPixelHeight}
              onTooltipHover={handleTooltipHover}
              onTooltipLeave={handleTooltipLeave}
              onTooltipToggle={handleTooltipToggle}
            />
          ) : chartType === "line" ? (
            <LineChartSvg
              data={chartData}
              colors={palette}
              max={max}
              showGrid={view.chartShowGrid ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={compactPixelWidth}
              compactPixelHeight={compactPixelHeight}
              onTooltipHover={handleTooltipHover}
              onTooltipLeave={handleTooltipLeave}
              onTooltipToggle={handleTooltipToggle}
            />
          ) : (
            <BarChartSvg
              data={chartData}
              colors={palette}
              max={max}
              showGrid={view.chartShowGrid ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={compactPixelWidth}
              compactPixelHeight={compactPixelHeight}
              onTooltipHover={handleTooltipHover}
              onTooltipLeave={handleTooltipLeave}
              onTooltipToggle={handleTooltipToggle}
            />
          )}
        </div>
      </div>
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

function formatAggregateValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function BarChartSvg({
  data,
  colors,
  max,
  showGrid,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactPixelWidth,
  compactPixelHeight,
  onTooltipHover,
  onTooltipLeave,
  onTooltipToggle,
}: {
  data: ChartDatum[];
  colors: string[];
  max: number;
  showGrid: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
  onTooltipHover: (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => void;
  onTooltipLeave: () => void;
  onTooltipToggle: (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => void;
}) {
  const size = getCompactCartesianMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    compactPixelWidth,
    compactPixelHeight,
  );
  const width = size.width;
  const height = size.height;
  const padding = size.padding;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const step = innerWidth / Math.max(data.length, 1);
  const compactBarScale = getCompactBarScale(compact, compactWidthUnits, compactPixelWidth);
  const barWidth = Math.min(step * 0.42, compact ? 36 * compactBarScale : 32);
  const barRadius = compact ? 4 : 5;
  const ticks = createTicks(max);
  const labelStep = getAxisLabelStep(data.length);

  return (
    <svg className="db-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {showGrid ? ticks.map((tick) => {
        const y = padding.top + innerHeight - (tick / Math.max(max, 1)) * innerHeight;
        return (
          <g key={tick}>
            <line className="db-chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            <text className="db-chart-axis-label" x={padding.left - 8} y={y + 4} textAnchor="end">
              {formatTick(tick)}
            </text>
          </g>
        );
      }) : null}

      <line className="db-chart-axis" x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight} y2={padding.top + innerHeight} />

      {data.map((datum, index) => {
        const color = colors[index % colors.length];
        const x = padding.left + step * index + (step - barWidth) / 2;
        const barHeight = max > 0 ? (datum.value / max) * innerHeight : 0;
        const y = padding.top + innerHeight - barHeight;
        return (
          <g key={datum.key}>
            <rect
              className="db-chart-hitbox"
              x={x - Math.max((Math.max(barWidth, 24) - barWidth) / 2, 6)}
              y={padding.top}
              width={Math.max(barWidth + 12, 28)}
              height={innerHeight}
              onMouseEnter={(event) => onTooltipHover(event, datum, color)}
              onMouseMove={(event) => onTooltipHover(event, datum, color)}
              onMouseLeave={onTooltipLeave}
              onClick={(event) => onTooltipToggle(event, datum, color)}
            />
            <rect
              className="db-chart-bar"
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 2)}
              rx={barRadius}
              ry={barRadius}
              fill={color}
              onMouseEnter={(event) => onTooltipHover(event, datum, color)}
              onMouseMove={(event) => onTooltipHover(event, datum, color)}
              onMouseLeave={onTooltipLeave}
              onClick={(event) => onTooltipToggle(event, datum, color)}
            />
            {shouldRenderAxisLabel(index, data.length, labelStep) ? (
              <text className="db-chart-axis-label" x={x + barWidth / 2} y={height - 26} textAnchor="middle">
                {truncateLabel(datum.label)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function LineChartSvg({
  data,
  colors,
  max,
  showGrid,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactPixelWidth,
  compactPixelHeight,
  onTooltipHover,
  onTooltipLeave,
  onTooltipToggle,
}: {
  data: ChartDatum[];
  colors: string[];
  max: number;
  showGrid: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
  onTooltipHover: (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => void;
  onTooltipLeave: () => void;
  onTooltipToggle: (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => void;
}) {
  const size = getCompactCartesianMetrics(
    compact,
    compactWidthUnits,
    compactHeightUnits,
    compactPixelWidth,
    compactPixelHeight,
  );
  const width = size.width;
  const height = size.height;
  const padding = size.padding;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const ticks = createTicks(max);
  const step = innerWidth / Math.max(data.length - 1, 1);
  const labelStep = getAxisLabelStep(data.length);

  const points = data.map((datum, index) => {
    const x = data.length === 1 ? padding.left + innerWidth / 2 : padding.left + step * index;
    const y = padding.top + innerHeight - (datum.value / Math.max(max, 1)) * innerHeight;
    return { x, y, datum };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? padding.left} ${padding.top + innerHeight} L ${points[0]?.x ?? padding.left} ${padding.top + innerHeight} Z`;

  return (
    <svg className="db-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {showGrid ? ticks.map((tick) => {
        const y = padding.top + innerHeight - (tick / Math.max(max, 1)) * innerHeight;
        return (
          <g key={tick}>
            <line className="db-chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            <text className="db-chart-axis-label" x={padding.left - 8} y={y + 4} textAnchor="end">
              {formatTick(tick)}
            </text>
          </g>
        );
      }) : null}

      <line className="db-chart-axis" x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight} y2={padding.top + innerHeight} />
      <path className="db-chart-line-area" d={areaPath} fill={colors[0]} />
      <path className="db-chart-line" d={linePath} stroke={colors[0]} />

      {points.map((point, index) => (
        <g key={point.datum.key}>
          <rect
            className="db-chart-hitbox"
            x={point.x - (data.length === 1 ? 36 : Math.max(step, 44) / 2)}
            y={padding.top}
            width={data.length === 1 ? 72 : Math.max(step, 44)}
            height={innerHeight}
            onMouseEnter={(event) => onTooltipHover(event, point.datum, colors[index % colors.length])}
            onMouseMove={(event) => onTooltipHover(event, point.datum, colors[index % colors.length])}
            onMouseLeave={onTooltipLeave}
            onClick={(event) => onTooltipToggle(event, point.datum, colors[index % colors.length])}
          />
          <circle
            className="db-chart-point"
            cx={point.x}
            cy={point.y}
            r={4}
            fill={colors[index % colors.length]}
          />
          <circle
            className="db-chart-point-core"
            cx={point.x}
            cy={point.y}
            r={2}
            fill="var(--base)"
          />
          {shouldRenderAxisLabel(index, data.length, labelStep) ? (
            <text className="db-chart-axis-label" x={point.x} y={height - 26} textAnchor="middle">
              {truncateLabel(point.datum.label)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

function DonutChartSvg({
  data,
  total,
  colors,
  showLegend,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactPixelWidth,
  compactPixelHeight,
  onTooltipHover,
  onTooltipLeave,
  onTooltipToggle,
}: {
  data: ChartDatum[];
  total: number;
  colors: string[];
  showLegend: boolean;
  compact?: boolean;
  compactWidthUnits?: number;
  compactHeightUnits?: number;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
  onTooltipHover: (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => void;
  onTooltipLeave: () => void;
  onTooltipToggle: (
    event: ReactMouseEvent<SVGElement | HTMLDivElement>,
    datum: ChartDatum,
    color: string,
    detail?: string,
  ) => void;
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
  const width = config.width;
  const height = config.height;
  const cx = config.cx;
  const cy = config.cy;
  const outerRadius = config.outerRadius;
  const innerRadius = config.innerRadius;
  let currentAngle = -90;
  const layoutClass =
    config.legendPlacement === "side"
      ? " db-chart-donut-layout--side"
      : config.legendPlacement === "below"
        ? " db-chart-donut-layout--stacked"
        : "";
  const compactClass = compact ? " db-chart-donut-layout--compact" : "";
  const svgStyle = {
    width: `${config.width}px`,
    height: `${config.height}px`,
    maxWidth: "100%",
    maxHeight: "100%",
  } satisfies CSSProperties;

  return (
    <div className={`db-chart-donut-layout${layoutClass}${compactClass}`}>
      <svg className="db-chart-svg db-chart-svg--donut" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={svgStyle}>
        {data.map((datum, index) => {
          const sweep = total > 0 ? (datum.value / total) * 360 : 0;
          const path = describeDonutArc(cx, cy, innerRadius, outerRadius, currentAngle, currentAngle + sweep);
          currentAngle += sweep;
          return (
            <path
              key={datum.key}
              d={path}
              fill={colors[index % colors.length]}
              className="db-chart-donut-segment"
              onMouseEnter={(event) => onTooltipHover(event, datum, colors[index % colors.length], formatShare(datum.value, total))}
              onMouseMove={(event) => onTooltipHover(event, datum, colors[index % colors.length], formatShare(datum.value, total))}
              onMouseLeave={onTooltipLeave}
              onClick={(event) => onTooltipToggle(event, datum, colors[index % colors.length], formatShare(datum.value, total))}
            />
          );
        })}
        <text className="db-chart-donut-total" x={cx} y={cy - 2} textAnchor="middle">
          {formatAggregateValue(total)}
        </text>
        <text className="db-chart-donut-caption" x={cx} y={cy + 18} textAnchor="middle">
          Total
        </text>
      </svg>

      {config.showLegend ? (
        <div className="db-chart-legend">
          {data.map((datum, index) => (
            <div
              key={datum.key}
              className="db-chart-legend-row"
              onMouseEnter={(event) => onTooltipHover(event, datum, colors[index % colors.length], formatShare(datum.value, total))}
              onMouseMove={(event) => onTooltipHover(event, datum, colors[index % colors.length], formatShare(datum.value, total))}
              onMouseLeave={onTooltipLeave}
              onClick={(event) => onTooltipToggle(event, datum, colors[index % colors.length], formatShare(datum.value, total))}
            >
              <span
                aria-hidden
                className="db-chart-legend-swatch"
                style={{ backgroundColor: colors[index % colors.length] }}
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

function createTicks(max: number) {
  const safeMax = Math.max(max, 1);
  return Array.from({ length: 4 }, (_, index) => Math.round((safeMax / 4) * (index + 1))).reverse();
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
    const width = clamp(pixelWidth - 24, 96, 760);
    const height = clamp(pixelHeight - 16, 136, 312);
    const bottom = width < 180 ? 34 : width < 280 ? 42 : width < 420 ? 52 : width < 560 ? 58 : 64;
    const left = width < 180 ? 18 : width < 280 ? 30 : width < 420 ? 40 : width < 560 ? 46 : 52;
    const right = width < 180 ? 6 : width < 280 ? 10 : width < 420 ? 12 : 18;
    return {
      width,
      height,
      padding: { top: 18, right, bottom, left },
    };
  }

  if (widthUnits <= 4) {
    return {
      width: 500,
      height: heightUnits >= 12 ? 278 : 246,
      padding: { top: 18, right: 14, bottom: 58, left: 44 },
    };
  }

  if (widthUnits <= 7) {
    return {
      width: 600,
      height: heightUnits >= 12 ? 286 : 258,
      padding: { top: 18, right: 16, bottom: 62, left: 48 },
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
      width: 720,
      height: 340,
      cx: 180,
      cy: 168,
      outerRadius: 112,
      innerRadius: getDonutInnerRadius(112),
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
    const canShowSideLegend =
      showLegend &&
      availableWidth >= 520 &&
      availableHeight >= 220 &&
      availableWidth / Math.max(availableHeight, 1) >= 1.35;

    if (canShowSideLegend) {
      const legendWidth = clamp(Math.round(availableWidth * 0.24), 160, 210);
      const chartWidth = availableWidth - legendWidth - 16;
      const diameter = clamp(
        Math.min(chartWidth * 0.9, availableHeight * 0.78),
        132,
        286,
      );
      const outerRadius = Math.floor(diameter / 2);
      const innerRadius = getDonutInnerRadius(outerRadius, 44);
      return {
        width: diameter + 24,
        height: diameter + 24,
        cx: (diameter + 24) / 2,
        cy: (diameter + 24) / 2,
        outerRadius,
        innerRadius,
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
      const innerRadius = getDonutInnerRadius(outerRadius, 42);
      return {
        width: diameter + 24,
        height: diameter + 24,
        cx: (diameter + 24) / 2,
        cy: (diameter + 24) / 2,
      outerRadius,
      innerRadius,
      showLegend,
      legendPlacement: showLegend ? ("below" as const) : ("hidden" as const),
    };
  }

  const canShowSideLegend = showLegend && widthUnits >= 9;
  const renderLegend = showLegend;

  if (canShowSideLegend) {
    return {
      width: widthUnits >= 9 ? 720 : 640,
      height: heightUnits >= 13 ? 360 : 326,
      cx: widthUnits >= 9 ? 190 : 176,
      cy: heightUnits >= 13 ? 178 : 162,
      outerRadius: widthUnits >= 9 ? 122 : 112,
      innerRadius: getDonutInnerRadius(widthUnits >= 9 ? 122 : 112),
      showLegend: true,
      legendPlacement: "side" as const,
    };
  }

  const outerRadius = renderLegend ? (heightUnits >= 12 ? 112 : 104) : 118;
  return {
    width: 480,
    height: renderLegend ? (heightUnits >= 12 ? 368 : 328) : 336,
    cx: 240,
    cy: renderLegend ? (heightUnits >= 12 ? 138 : 132) : 168,
    outerRadius,
    innerRadius: getDonutInnerRadius(outerRadius),
    showLegend: renderLegend,
    legendPlacement: renderLegend ? ("below" as const) : ("hidden" as const),
  };
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

function shouldRenderAxisLabel(index: number, length: number, step: number) {
  return index === 0 || index === length - 1 || index % step === 0;
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

function describeDonutArc(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", startOuter.x, startOuter.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    "L", startInner.x, startInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, endInner.x, endInner.y,
    "Z",
  ].join(" ");
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}
