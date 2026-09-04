import { useQuery } from "@tanstack/react-query";

import { collectActivitySnapshot, type ActivityMetric } from "@/lib/activity";
import type { HomeInstrumentPin } from "@/lib/home-pins";
import { cn } from "@/lib/utils";

export const ACTIVITY_QUERY_KEY = ["activity", "snapshot"] as const;

export function InstrumentWidget({ pin }: { pin: HomeInstrumentPin }) {
  const { data, isPending, error } = useQuery({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: () => collectActivitySnapshot(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const metric = data?.metrics.find((candidate) => candidate.id === pin.instrumentId);

  if (isPending) {
    return <div className="h-full animate-pulse bg-[var(--surface-wash)]" aria-label="Loading activity instrument" />;
  }
  if (error || !metric) {
    return (
      <div className="flex h-full items-center px-4 font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">
        This activity measure is unavailable.
      </div>
    );
  }

  return <InstrumentFigure metric={metric} />;
}

export function InstrumentFigure({ metric, compact = false }: { metric: ActivityMetric; compact?: boolean }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", compact ? "gap-1" : "justify-between gap-4 p-4")}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span
          className={cn(
            "font-mono font-light tabular-nums tracking-[-0.035em] text-[var(--text)]",
            compact ? "text-lg" : "text-[clamp(2rem,5vw,3.4rem)]",
            metric.tone === "good" && "text-[var(--ok)]",
            metric.tone === "bad" && "text-[var(--bad)]",
            metric.tone === "waiting" && "text-[var(--wait)]",
          )}
        >
          {metric.value}
        </span>
        <span className="truncate font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">{metric.word}</span>
      </div>
      {metric.sparkline.length > 1 ? <Sparkline values={metric.sparkline} /> : <div className="h-8" />}
      {!compact && metric.detail ? (
        <p className="truncate font-ui text-[var(--t-count)] text-[var(--overlay-1)]">{metric.detail}</p>
      ) : null}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 160;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-8 w-full text-[var(--overlay-1)]" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
