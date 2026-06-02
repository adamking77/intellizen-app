import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { Bar } from "@/components/charts/bar";
import { BarChart as BklitBarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { BarYAxis } from "@/components/charts/bar-y-axis";
import { Gauge } from "@/components/charts/gauge";
import { Grid } from "@/components/charts/grid";
import { Line, LineChart as BklitLineChart } from "@/components/charts/line-chart";
import { PieCenter } from "@/components/charts/pie-center";
import { PieChart as BklitPieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { ProfitLossLine } from "@/components/charts/profit-loss-line";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
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

interface ChartSeries {
  key: string;
  label: string;
  color: string;
  metricLabel: string;
}

type SeriesChartDatum = Record<string, unknown> & {
  key: string;
  label: string;
  fullLabel?: string;
};

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
const COMPACT_CHART_HORIZONTAL_PADDING = 24;
const COMPACT_CHART_VERTICAL_PADDING = 22;
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
  const shouldMeasureFrame = !compact || compactPixelWidth <= 0 || compactPixelHeight <= 0;
  const [frameRef, frameSize] = useMeasuredElementSize<HTMLDivElement>(shouldMeasureFrame);
  const resolvedCompactFrameSize = useMemo(
    () => getCompactFrameSize(compact, compactPixelWidth, compactPixelHeight, frameSize.width, frameSize.height),
    [compact, compactPixelHeight, compactPixelWidth, frameSize.height, frameSize.width],
  );
  const cartesianWidthTier = useStableCartesianWidthTier(
    compact,
    compactWidthUnits,
    resolvedCompactFrameSize.width,
  );
  const chartType = view.chartType ?? "bar";
  const chartRange = view.chartRange ?? "90d";
  const aggregation = view.chartAggregation ?? "count";
  const supportsMultiSeries = chartType === "bar" || chartType === "line";
  const chartSeriesMode = supportsMultiSeries ? view.chartSeriesMode ?? "single" : "single";
  const metricAggregation = chartSeriesMode === "multi" && aggregation === "count" ? "sum" : aggregation;
  const palette = CHART_PALETTES[view.chartPalette ?? "blue"];
  const groupField = chartType === "gauge"
    ? undefined
    : database.schema.find((field) => field.id === view.groupBy) ?? findDefaultChartGroupField(database, chartType);
  const valueField = database.schema.find((field) => field.id === view.chartValueField) ?? findDefaultChartValueField(database);
  const multiValueFields = useMemo(
    () => getSelectedChartValueFields(database, view.chartValueFields, valueField),
    [database, valueField, view.chartValueFields],
  );
  const activeValueFields = chartSeriesMode === "multi" ? multiValueFields : valueField ? [valueField] : [];
  const isValidGroupField = groupField
    ? getChartGroupCandidates(database, chartType).some((field) => field.id === groupField.id)
    : chartType === "gauge";
  const records = useMemo(() => getViewRecords(database, view, catalog), [catalog, database, view]);
  const chartRecords = useMemo(
    () => filterChartRecords(records, database, catalog, groupField, chartType, chartRange),
    [catalog, chartRange, chartType, database, groupField, records],
  );
  const chartData = useMemo(
    () =>
      chartSeriesMode === "multi"
        ? buildMultiSeriesChartData(chartRecords, database, catalog, groupField, activeValueFields, metricAggregation, chartType)
        : buildChartData(chartRecords, database, catalog, groupField, valueField, aggregation, chartType),
    [activeValueFields, aggregation, catalog, chartRecords, chartSeriesMode, chartType, database, groupField, metricAggregation, valueField],
  );
  const gaugeValue = useMemo(
    () => buildGaugeValue(chartRecords, database, catalog, valueField, aggregation),
    [aggregation, catalog, chartRecords, database, valueField],
  );
  const gaugeTarget = Math.max(view.chartGoalValue ?? 100, 0);
  const chartSeries = useMemo(
    () => activeValueFields.map((field, index) => ({
      key: getSeriesKey(field.id),
      label: field.name,
      color: palette[index % palette.length],
      metricLabel: `${capitalize(metricAggregation)} ${field.name}`,
    })),
    [activeValueFields, metricAggregation, palette],
  );
  const total = chartData.reduce((sum, datum) => sum + datum.value, 0);
  const seriesData = useMemo(
    () => chartData.map((datum, index) => ({
      ...datum,
      color: chartType === "line" ? palette[0] : palette[index % palette.length],
      detail: chartType === "donut" || chartType === "pie" ? formatShare(datum.value, total) : undefined,
    })),
    [chartData, chartType, palette, total],
  );

  if (chartType !== "gauge" && (!groupField || !isValidGroupField)) {
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

  if ((aggregation !== "count" || chartSeriesMode === "multi") && activeValueFields.length === 0) {
    return (
      <EmptyState
        title="Chart needs a numeric field"
        description={
          chartSeriesMode === "multi"
            ? "Choose at least one number, rollup, or formula field for the chart series."
            : "Choose a number, rollup, or formula field for this chart."
        }
        action={{ label: "+ New record", onClick: onCreateRecord }}
      />
    );
  }

  if (chartType !== "gauge" && chartData.length === 0) {
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

  const summaryLabel = aggregation === "count"
    ? chartType === "gauge"
      ? `${gaugeValue} records`
      : `${total} records`
    : chartType === "gauge"
      ? `${formatAggregateValue(gaugeValue)} ${aggregation}`
      : `${formatAggregateValue(total)} ${aggregation}`;
  const valueLabel = aggregation === "count"
    ? "Count records"
    : `${capitalize(aggregation)} ${valueField?.name ?? "value"}`;
  const chartContextLabel =
    chartType === "gauge"
      ? `Target ${formatAggregateValue(gaugeTarget)}`
      : chartType === "line"
        ? `${chartData.length} points`
        : `${chartData.length} groups`;
  const rangeLabel = chartType === "line" ? formatChartRangeLabel(chartRange) : null;
  const captionParts = [
    chartType === "gauge" ? valueLabel : `${valueLabel} by ${groupField?.name ?? "group"}`,
    chartContextLabel,
    rangeLabel,
  ].filter(Boolean);

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
          className={`db-chart-frame${chartType === "donut" || chartType === "pie" || chartType === "gauge" ? " db-chart-frame--donut" : " db-chart-frame--cartesian"}`}
        >
          {chartType === "donut" || chartType === "pie" ? (
            <PieChartCard
              data={seriesData}
              variant={chartType}
              showLegend={view.chartShowLegend ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={resolvedCompactFrameSize.width}
              compactPixelHeight={resolvedCompactFrameSize.height}
            />
          ) : chartType === "gauge" ? (
            <GaugeChartCard
              value={gaugeValue}
              target={gaugeTarget}
              label={valueLabel}
              color={palette[0]}
              compact={compact}
              compactPixelWidth={resolvedCompactFrameSize.width}
              compactPixelHeight={resolvedCompactFrameSize.height}
            />
          ) : chartType === "line" ? (
            <LineChartCard
              data={seriesData}
              seriesData={chartData}
              series={chartSeriesMode === "multi" ? chartSeries : undefined}
              lineVariant={view.chartLineVariant ?? "standard"}
              metricLabel={valueLabel}
              showGrid={view.chartShowGrid ?? true}
              showXAxis={view.chartShowXAxis ?? true}
              showYAxis={view.chartShowYAxis ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactWidthTier={cartesianWidthTier}
              compactPixelWidth={resolvedCompactFrameSize.width}
              compactPixelHeight={resolvedCompactFrameSize.height}
            />
          ) : (
            <BarChartCard
              data={seriesData}
              seriesData={chartData}
              series={chartSeriesMode === "multi" ? chartSeries : undefined}
              orientation={view.chartOrientation ?? "vertical"}
              metricLabel={valueLabel}
              showGrid={view.chartShowGrid ?? true}
              compact={compact}
              compactWidthUnits={compactWidthUnits}
              compactHeightUnits={compactHeightUnits}
              compactPixelWidth={resolvedCompactFrameSize.width}
              compactPixelHeight={resolvedCompactFrameSize.height}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BarChartCard({
  data,
  seriesData,
  series,
  orientation,
  metricLabel,
  showGrid,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactWidthTier,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  seriesData?: SeriesChartDatum[];
  series?: ChartSeries[];
  orientation: "vertical" | "horizontal";
  metricLabel: string;
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
  const maxLabels = Math.ceil(data.length / getAxisLabelStep(data.length));
  const isHorizontal = orientation === "horizontal";
  const chartData = useMemo(
    () => series?.length ? (seriesData ?? []).map(toBklitMultiCategoryDatum) : data.map(toBklitCategoryDatum),
    [data, series, seriesData],
  );
  const barWidth = isHorizontal ? undefined : metrics.maxBarSize;
  const margin = isHorizontal
    ? {
        ...metrics.margin,
        left: compact ? 72 : 96,
        right: compact ? 18 : 32,
        bottom: compact ? 14 : 20,
      }
    : metrics.margin;

  return (
    <div className="db-chart-canvas" style={{ height: `${metrics.height}px` }}>
      <BklitBarChart
        animationDuration={0}
        aspectRatio="auto"
        barWidth={barWidth}
        className="h-full"
        data={chartData}
        margin={margin}
        orientation={orientation}
        xDataKey="label"
      >
        {showGrid ? (
          <Grid
            fadeHorizontal={false}
            horizontal={!isHorizontal}
            strokeDasharray="0"
            vertical={isHorizontal}
          />
        ) : null}
        {series?.length ? (
          series.map((item) => (
            <Bar
              animate={false}
              dataKey={item.key}
              fill={item.color}
              key={item.key}
              lineCap={metrics.barRadius}
              stroke={item.color}
            />
          ))
        ) : (
          <Bar
            animate={false}
            dataKey="value"
            fill={(datum) => String(datum.color ?? "var(--chart-line-primary)")}
            lineCap={metrics.barRadius}
            stroke="var(--chart-line-primary)"
          />
        )}
        {!isHorizontal ? <YAxis formatValue={formatTick} /> : null}
        {isHorizontal ? <BarYAxis maxLabels={maxLabels} /> : <BarXAxis maxLabels={maxLabels} />}
        <ChartTooltip
          content={({ point }) =>
            series?.length ? (
              <MultiChartTooltipCard point={point} series={series} />
            ) : (
              <ChartTooltipCard
                color={coerceChartDatum(point)?.color}
                datum={coerceChartDatum(point)}
                metricLabel={metricLabel}
              />
            )
          }
          showDatePill={false}
          showDots={false}
        />
      </BklitBarChart>
    </div>
  );
}

function LineChartCard({
  data,
  seriesData,
  series,
  lineVariant,
  metricLabel,
  showGrid,
  showXAxis,
  showYAxis,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactWidthTier,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  seriesData?: SeriesChartDatum[];
  series?: ChartSeries[];
  lineVariant: "standard" | "profitLoss";
  metricLabel: string;
  showGrid: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
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
  const lineColor = data[0]?.color ?? "var(--accent)";
  const isProfitLoss = lineVariant === "profitLoss" && !series?.length;
  const chartData = useMemo(
    () => series?.length ? (seriesData ?? []).map(toBklitMultiTimeDatum) : data.map(toBklitTimeDatum),
    [data, series, seriesData],
  );
  const numTicks = Math.max(2, Math.min(5, Math.ceil(data.length / getAxisLabelStep(data.length))));

  return (
    <div className="db-chart-canvas" style={{ height: `${metrics.height}px` }}>
      <BklitLineChart
        animationDuration={0}
        aspectRatio="auto"
        className="h-full"
        data={chartData}
        margin={metrics.margin}
        xDataKey="date"
      >
        {showGrid ? (
          <Grid
            fadeHorizontal={false}
            highlightRowStroke="var(--text)"
            highlightRowStrokeOpacity={0.35}
            highlightRowValues={isProfitLoss ? [0] : undefined}
            horizontal
            strokeDasharray="0"
          />
        ) : null}
        {series?.length ? (
          series.map((item) => (
            <Line
              animate={false}
              dataKey={item.key}
              key={item.key}
              showMarkers={false}
              stroke={item.color}
              strokeWidth={2.5}
            />
          ))
        ) : isProfitLoss ? (
          <>
            <Line
              animate={false}
              dataKey="value"
              fadeEdges={false}
              showHighlight={false}
              stroke="transparent"
              strokeWidth={0}
            />
            <ProfitLossLine
              dataKey="value"
              negativeColor="var(--red)"
              positiveColor="var(--green)"
              strokeWidth={3}
            />
          </>
        ) : (
          <Line
            animate={false}
            dataKey="value"
            showMarkers={false}
            stroke={lineColor}
            strokeWidth={3}
          />
        )}
        {showYAxis ? <YAxis formatValue={formatTick} /> : null}
        {showXAxis ? <XAxis numTicks={numTicks} tickMode="data" /> : null}
        <ChartTooltip
          content={({ point }) =>
            series?.length ? (
              <MultiChartTooltipCard point={point} series={series} />
            ) : (
              <ChartTooltipCard
                color={lineColor}
                datum={coerceChartDatum(point)}
                metricLabel={metricLabel}
              />
            )
          }
          showDatePill={false}
        />
      </BklitLineChart>
    </div>
  );
}

function PieChartCard({
  data,
  variant,
  showLegend,
  compact,
  compactWidthUnits,
  compactHeightUnits,
  compactPixelWidth,
  compactPixelHeight,
}: {
  data: ChartDatum[];
  variant: "donut" | "pie";
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
  const chartSize = Math.min(config.chartWidth, config.height);
  const innerRadius = variant === "donut" ? config.innerRadius : 0;
  const chartData = useMemo(() => data.map(toBklitPieDatum), [data]);
  const canvasStyle = {
    width: `${config.chartWidth}px`,
    height: `${config.height}px`,
  } satisfies CSSProperties;

  return (
    <div className={`db-chart-donut-layout${layoutClass}${compactClass}`}>
      <div className="db-chart-donut-canvas" style={canvasStyle}>
        <BklitPieChart
          className="h-full w-full"
          cornerRadius={3}
          data={chartData}
          hoverOffset={4}
          innerRadius={innerRadius}
          padAngle={data.length > 1 ? 0.02 : 0}
          size={chartSize}
        >
          {data.map((datum, index) => (
            <PieSlice
              animate={false}
              color={datum.color}
              hoverEffect="translate"
              hoverOffset={4}
              index={index}
              key={datum.key}
              showGlow={false}
            />
          ))}
          {variant === "donut" ? (
            <PieCenter
              defaultLabel="Total"
              labelClassName="db-chart-donut-caption"
              valueClassName="db-chart-donut-total"
            >
              {({ value, label }) => (
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="db-chart-donut-total">{formatAggregateValue(value)}</span>
                  <span className="db-chart-donut-caption">{label}</span>
                </div>
              )}
            </PieCenter>
          ) : null}
        </BklitPieChart>
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

function GaugeChartCard({
  value,
  target,
  label,
  color,
  compact,
  compactPixelWidth,
  compactPixelHeight,
}: {
  value: number;
  target: number;
  label: string;
  color: string;
  compact?: boolean;
  compactPixelWidth?: number;
  compactPixelHeight?: number;
}) {
  const width = Math.max(compactPixelWidth ?? 320, compact ? 180 : 280);
  const height = Math.max(Math.min(compactPixelHeight ?? 300, compact ? 260 : 340), compact ? 170 : 240);
  const size = Math.min(width, height);
  const percent = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;

  return (
    <div className={`db-chart-donut-layout${compact ? " db-chart-donut-layout--compact" : " db-chart-donut-layout--side"}`}>
      <div className="db-chart-donut-canvas" style={{ width: `${size}px`, height: `${height}px` }}>
        <Gauge
          activeFill={color}
          centerValue={value}
          className="h-full w-full"
          defaultLabel={label}
          height={size}
          inactiveFill="var(--surface-wash)"
          inactiveFillOpacity={0.55}
          minWidth={0}
          notchCornerRadius={3}
          spacing={28}
          suffix=""
          totalNotches={44}
          value={percent}
          width={size}
        />
      </div>
      {!compact ? (
        <div className="db-chart-legend">
          <div className="db-chart-legend-row">
            <span aria-hidden className="db-chart-legend-swatch" style={{ backgroundColor: color }} />
            <span className="db-chart-legend-label">Progress</span>
            <span className="db-chart-legend-value">{formatAggregateValue(percent)}%</span>
          </div>
          <div className="db-chart-legend-row">
            <span aria-hidden className="db-chart-legend-swatch" style={{ backgroundColor: "var(--surface-wash)" }} />
            <span className="db-chart-legend-label">Target</span>
            <span className="db-chart-legend-value">{formatAggregateValue(target)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChartTooltipCard({
  color,
  datum,
  metricLabel,
}: {
  color?: string;
  datum: ChartDatum | null;
  metricLabel: string;
}) {
  if (!datum) return null;
  const swatchColor = color ?? datum.color ?? "var(--accent)";

  return (
    <div className="db-chart-tooltip">
      <div className="db-chart-tooltip-title">
        <span
          aria-hidden
          className="db-chart-tooltip-swatch"
          style={{ backgroundColor: swatchColor }}
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

function MultiChartTooltipCard({
  point,
  series,
}: {
  point: Record<string, unknown>;
  series: ChartSeries[];
}) {
  const title = String(point.fullLabel ?? point.label ?? point.key ?? "Value");

  return (
    <div className="db-chart-tooltip">
      <div className="db-chart-tooltip-title">
        <span className="db-chart-tooltip-label">{title}</span>
      </div>
      {series.map((item) => {
        const value = point[item.key];
        if (typeof value !== "number" || !Number.isFinite(value)) return null;

        return (
          <div className="db-chart-tooltip-row" key={item.key}>
            <span className="db-chart-tooltip-metric">
              <span
                aria-hidden
                className="db-chart-tooltip-swatch"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
            <span className="db-chart-tooltip-value">{formatAggregateValue(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function toBklitCategoryDatum(datum: ChartDatum): Record<string, unknown> {
  return {
    ...datum,
    fullLabel: datum.label,
    label: truncateLabel(datum.label),
  };
}

function toBklitMultiCategoryDatum(datum: SeriesChartDatum): Record<string, unknown> {
  return {
    ...datum,
    fullLabel: datum.label,
    label: truncateLabel(datum.label),
  };
}

function toBklitTimeDatum(datum: ChartDatum): Record<string, unknown> {
  return {
    ...datum,
    date: normalizeChartDateKey(datum.key),
  };
}

function toBklitMultiTimeDatum(datum: SeriesChartDatum): Record<string, unknown> {
  return {
    ...datum,
    date: normalizeChartDateKey(datum.key),
  };
}

function toBklitPieDatum(datum: ChartDatum) {
  return {
    label: datum.label,
    value: datum.value,
    color: datum.color,
  };
}

function coerceChartDatum(point: Record<string, unknown>): ChartDatum | null {
  const value = point.value;
  if (typeof value !== "number") return null;

  return {
    key: String(point.key ?? point.label ?? ""),
    label: String(point.fullLabel ?? point.label ?? point.key ?? "Value"),
    value,
    color: typeof point.color === "string" ? point.color : undefined,
    detail: typeof point.detail === "string" ? point.detail : undefined,
  };
}

function useMeasuredElementSize<T extends HTMLElement>(enabled = true) {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((nextNode: T | null) => {
    setNode(nextNode);
  }, []);

  useLayoutEffect(() => {
    if (!enabled || !node || typeof ResizeObserver === "undefined") return;
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
  }, [enabled, node]);

  return [ref, size] as const;
}

function getCompactFrameSize(
  compact: boolean | undefined,
  compactPixelWidth: number | undefined,
  compactPixelHeight: number | undefined,
  measuredWidth: number,
  measuredHeight: number,
) {
  if (!compact) {
    return {
      width: measuredWidth || compactPixelWidth || 0,
      height: measuredHeight || compactPixelHeight || 0,
    };
  }

  const outerWidth = compactPixelWidth ?? 0;
  const outerHeight = compactPixelHeight ?? 0;
  if (outerWidth > 0 && outerHeight > 0) {
    return {
      width: snapChartFrameSize(Math.max(outerWidth - COMPACT_CHART_HORIZONTAL_PADDING, 0)),
      height: snapChartFrameSize(Math.max(outerHeight - COMPACT_CHART_VERTICAL_PADDING, 0)),
    };
  }

  return {
    width: measuredWidth,
    height: measuredHeight,
  };
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
    .filter((datum) =>
      Number.isFinite(datum.value) &&
      (chartType !== "line" || isValidChartDateKey(datum.key)) &&
      (chartType === "line" || datum.value > 0)
    );

  if (groupField.type === "date" || chartType === "line") {
    return data.sort((left, right) => compareChartKeys(left.key, right.key));
  }

  return data.sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function buildMultiSeriesChartData(
  records: WorkspaceDatabaseRecordModel[],
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
  groupField: WorkspaceDatabaseField | undefined,
  valueFields: WorkspaceDatabaseField[],
  aggregation: WorkspaceDatabaseChartAggregation,
  chartType: WorkspaceDatabaseModel["views"][number]["chartType"],
) {
  if (!groupField || valueFields.length === 0) return [];

  const buckets = new Map<string, { label: string; values: Record<string, number[]>; count: number }>();

  for (const record of records) {
    const groups = getBucketEntries(record, groupField, database, catalog);
    if (groups.length === 0) continue;

    for (const group of groups) {
      const existing = buckets.get(group.key) ?? { label: group.label, values: {}, count: 0 };
      existing.count += 1;

      for (const field of valueFields) {
        const numericValue = getNumericValue(record, field, database, catalog);
        if (numericValue === null) continue;
        const key = getSeriesKey(field.id);
        existing.values[key] = existing.values[key] ?? [];
        existing.values[key].push(numericValue);
      }

      buckets.set(group.key, existing);
    }
  }

  const data = [...buckets.entries()]
    .map(([key, bucket]) => {
      const datum: SeriesChartDatum & { value: number } = {
        key,
        label: bucket.label,
        value: 0,
      };

      for (const field of valueFields) {
        const seriesKey = getSeriesKey(field.id);
        const value = aggregateBucket({ values: bucket.values[seriesKey] ?? [], count: bucket.count }, aggregation);
        datum[seriesKey] = value;
        datum.value += value;
      }

      return datum;
    })
    .filter((datum) =>
      Number.isFinite(datum.value) &&
      (chartType !== "line" || isValidChartDateKey(datum.key)) &&
      (chartType === "line" || datum.value > 0)
    );

  if (groupField.type === "date" || chartType === "line") {
    return data.sort((left, right) => compareChartKeys(left.key, right.key));
  }

  return data.sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function buildGaugeValue(
  records: WorkspaceDatabaseRecordModel[],
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
  valueField: WorkspaceDatabaseField | undefined,
  aggregation: WorkspaceDatabaseChartAggregation,
) {
  if (aggregation === "count") return records.length;
  if (!valueField) return 0;

  const values = records
    .map((record) => getNumericValue(record, valueField, database, catalog))
    .filter((value): value is number => value !== null);

  return aggregateBucket({ values, count: records.length }, aggregation);
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

function getSelectedChartValueFields(
  database: WorkspaceDatabaseModel,
  selectedIds: string[] | undefined,
  fallbackField: WorkspaceDatabaseField | undefined,
) {
  const fieldsById = new Map(database.schema.map((field) => [field.id, field]));
  const selectedFields = (selectedIds ?? [])
    .map((fieldId) => fieldsById.get(fieldId))
    .filter((field): field is WorkspaceDatabaseField => field !== undefined && isNumericChartField(field));

  if (selectedFields.length > 0) return selectedFields;
  return fallbackField && isNumericChartField(fallbackField) ? [fallbackField] : [];
}

function isNumericChartField(field: WorkspaceDatabaseField) {
  return field.type === "number" || field.type === "rollup" || field.type === "formula";
}

function getSeriesKey(fieldId: string) {
  return `series_${fieldId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
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
  return Math.max(Math.floor(outerRadius * 0.9), minInnerRadius);
}

function normalizeChartDateKey(key: string): Date {
  const date = new Date(key);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function isValidChartDateKey(key: string): boolean {
  return Number.isFinite(Date.parse(key));
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
