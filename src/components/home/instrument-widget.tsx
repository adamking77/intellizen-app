import { ActivityWidget } from "@/components/activity/activity-dashboard";
import { ACTIVITY_CARDS, type ActivityCardId } from "@/lib/activity-dashboard";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { useQuery } from "@tanstack/react-query";

import { collectActivitySnapshot, type ActivityMetric } from "@/lib/activity";
import type { HomeInstrumentPin } from "@/lib/home-pins";
import { cn } from "@/lib/utils";

export const ACTIVITY_QUERY_KEY = ["activity", "snapshot"] as const;

export function InstrumentWidget({ pin }: { pin: HomeInstrumentPin }) {
  const card = pin.instrumentId.slice(9) as ActivityCardId;
  if (pin.instrumentId.startsWith("activity.") && ACTIVITY_CARDS.includes(card)) return <ActivityWidget pin={pin} card={card} />;
  return <LegacyInstrumentWidget pin={pin} />;
}

function LegacyInstrumentWidget({ pin }: { pin: HomeInstrumentPin }) {
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
  const data = values.map((value, index) => ({ date: new Date(2020, 0, index + 1), value }));
  return <div className="h-8 w-full" aria-hidden><LineChart data={data} className="h-8" margin={{ top: 2, bottom: 2, left: 0, right: 0 }} aspectRatio="5 / 1" animationDuration={0}><Line dataKey="value" animate={false} showHighlight={false} fadeEdges={false} /></LineChart></div>;
}
