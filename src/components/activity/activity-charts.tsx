import { curveLinear } from "d3-shape";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { BarYAxis } from "@/components/charts/bar-y-axis";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import type { ActivityDashboardModel } from "@/lib/activity-dashboard";
import type { ActivityChartStyle } from "@/lib/activity-pins";

const COLORS: Record<string, string> = {
  Completed: "var(--accent)", Failed: "color-mix(in srgb,var(--accent) 85%,var(--ground))", Cancelled: "color-mix(in srgb,var(--accent) 70%,var(--ground))",
  Blocked: "color-mix(in srgb,var(--accent) 55%,var(--ground))", Deferred: "color-mix(in srgb,var(--accent) 40%,var(--ground))", Open: "color-mix(in srgb,var(--accent) 25%,var(--ground))",
};
const cost = (n: unknown) => typeof n === "number" ? new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD", maximumFractionDigits: 4,
}).format(n) : "Not reported";
const SERIES = [
  { key: "reported", label: "Reported", color: "var(--chart-line-primary)" },
  { key: "estimated", label: "Estimated", color: "var(--chart-line-primary)" },
];

export function UsageChart({ model, style }: { model: ActivityDashboardModel; style: ActivityChartStyle }) {
  const series = SERIES.filter((s) => model.usageDays.some((d) => d[s.key as "reported" | "estimated"] !== null))
    .map((s) => ({ ...s, color: style === "bar" && s.key === "estimated" ? "var(--chart-line-secondary)" : s.color }));
  const rows = (point: Record<string, unknown>) => series.map((s) => ({ color: s.color, label: s.label, value: cost(point[s.key]) }));
  const data = model.usageDays.map((d) => ({ ...d, label: d.date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) }));
  return <>
    <div className="mb-3 flex gap-4 font-mono text-[var(--t-meta)] text-[var(--text-muted)]">
      {series.map((s) => <span key={s.key} className="inline-flex items-center gap-2"><svg aria-hidden width="18" height="6"><path d="M0 3H18" stroke={s.color} strokeWidth={style === "bar" ? 6 : 2} strokeDasharray={style !== "bar" && s.key === "estimated" ? "4 3" : undefined} /></svg>{s.label}</span>)}
    </div>
    <div className="h-[200px]" role="img" aria-label="Daily session cost in USD. Missing reports remain gaps. Exact values available in daily reports below.">
      {style === "bar" ? <BarChart data={data} xDataKey="label" aspectRatio="auto" className="h-full" margin={{ top: 12, bottom: 30, left: 56, right: 16 }} animationDuration={0}>
        <Grid horizontal fadeHorizontal={false} />
        {series.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} animate={false} lineCap={3} maxWidth={16} />)}
        <YAxis numTicks={4} formatValue={(v) => cost(v)} />
        <BarXAxis maxLabels={4} tickerHalfWidth={30} />
        <ChartTooltip rows={rows} showDots={false} showDatePill={false} />
      </BarChart> : <LineChart data={data} aspectRatio="auto" className="h-full" margin={{ top: 12, bottom: 30, left: 56, right: 16 }} animationDuration={0}>
        <Grid horizontal fadeHorizontal={false} />
        {series.map((s) => <Line key={s.key} dataKey={s.key} stroke={s.color} dashFromIndex={s.key === "estimated" ? 0 : undefined} showHighlight={false} animate={false} curve={curveLinear} fadeEdges={false} showMarkers markers={{ radius: 2.5, strokeWidth: 0, ringGap: 0, inactiveBlur: 0, enterBlur: 0, showActiveHighlight: false }} strokeWidth={2} />)}
        <YAxis numTicks={4} formatValue={(v) => cost(v)} />
        <XAxis numTicks={4} tickMode="domain" tickerHalfWidth={30} />
        <ChartTooltip rows={rows} showDatePill={false} />
      </LineChart>}
    </div>
  </>;
}

export function OutcomesChart({ model, style }: { model: ActivityDashboardModel; style: ActivityChartStyle }) {
  const data = model.outcomes.filter((o) => o.count > 0);
  return <div className="@container">
    <div role="img" aria-label={model.outcomes.map((o) => `${o.name}: ${o.count}`).join(", ")} className={style === "bar" ? "h-[220px]" : "flex flex-wrap items-center justify-center gap-x-6 gap-y-2"}>
      {style === "bar" ? <BarChart data={data} xDataKey="name" aspectRatio="auto" className="h-full" margin={{ top: 12, bottom: 12, left: 96, right: 24 }} animationDuration={0} orientation="horizontal">
        <Grid horizontal={false} vertical numTicksColumns={4} fadeVertical={false} />
        <Bar dataKey="count" animate={false} fill={(d) => COLORS[String(d.name)]} lineCap={4} maxWidth={28} />
        <BarYAxis maxLabels={6} />
        <ChartTooltip rows={(p) => [{ label: String(p.name), value: Number(p.count), color: COLORS[String(p.name)] }]} showDots={false} showDatePill={false} />
      </BarChart> : <>
        <PieChart data={data.map((o) => ({ label: o.name, value: o.count, color: COLORS[o.name] }))} size={210} innerRadius={76} padAngle={0.035} cornerRadius={3} hoverOffset={3} enterTransition={{ duration: 0 }} enterStaggerScale={0}>
          {data.map((o, index) => <PieSlice key={o.name} index={index} />)}
          <PieCenter defaultLabel="workflow runs" />
        </PieChart>
        <dl className="min-w-32 space-y-2.5 py-3 text-[var(--t-meta)]">
          {data.map((o) => <div key={o.name} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[o.name] }} /><dt className="grow text-[var(--text-muted)]">{o.name}</dt><dd className="ml-5 font-mono tabular-nums">{o.count}</dd></div>)}
        </dl>
      </>}
    </div>
  </div>;
}
