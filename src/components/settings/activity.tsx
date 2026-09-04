import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff } from "lucide-react";

import { ACTIVITY_QUERY_KEY, InstrumentFigure } from "@/components/home/instrument-widget";
import { collectActivitySnapshot, formatDuration, type ActivityMetric, type ActivitySection } from "@/lib/activity";
import { listHomePinsFromWorkspace, saveHomePinsToWorkspace } from "@/lib/data";
import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import { isInstrumentHomePin, toggleInstrumentHomePin } from "@/lib/home-pins";
import { toast } from "@/lib/toast";

import { SETTINGS_TITLE } from "./settings-style";

const SECTIONS: ActivitySection[] = ["Agents", "Engine", "Work", "Attention"];

export function ActivitySettings() {
  const queryClient = useQueryClient();
  const snapshot = useQuery({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: () => collectActivitySnapshot(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const pins = useQuery({ queryKey: ["home-pins"], queryFn: listHomePinsFromWorkspace, staleTime: 0 });

  async function togglePin(metric: ActivityMetric) {
    const result = await mutateAuthoritativeHomePins({
      read: listHomePinsFromWorkspace,
      write: saveHomePinsToWorkspace,
      transform: (current) => toggleInstrumentHomePin(current, { instrumentId: metric.id, title: metric.label }),
    });
    queryClient.setQueryData(["home-pins"], result.authoritative);
    toast.success(result.authoritative.some((pin) => isInstrumentHomePin(pin) && pin.instrumentId === metric.id)
      ? `${metric.label} pinned to Home`
      : `${metric.label} removed from Home`);
  }

  return (
    <div className="space-y-5 pb-6">
      <header className="pb-1.5">
        <h1 className={SETTINGS_TITLE}>Activity</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">
          Live measures from Hermes sessions, engines, and workspace receipts. This page only reads.
        </p>
      </header>

      {snapshot.isPending ? (
        <div role="status" className="grid grid-cols-2 gap-2" aria-label="Loading activity">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-[var(--r-ctl)] bg-[var(--line)] opacity-40" />)}
        </div>
      ) : snapshot.error ? (
        <p className="text-xs text-[var(--bad)]">Activity could not be read: {snapshot.error.message}</p>
      ) : (
        SECTIONS.map((section) => {
          const metrics = snapshot.data.metrics.filter((metric) => metric.section === section);
          if (!metrics.length) return null;
          return (
            <section key={section} aria-labelledby={`activity-${section.toLowerCase()}`}>
              <h2 id={`activity-${section.toLowerCase()}`} className="mb-1 px-0.5 font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">{section}</h2>
              <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                {metrics.map((metric) => {
                  const pinned = (pins.data ?? []).some((pin) => isInstrumentHomePin(pin) && pin.instrumentId === metric.id);
                  return (
                    <div key={metric.id} className="grid min-h-16 grid-cols-[minmax(180px,1fr)_minmax(150px,220px)_auto] items-center gap-4 px-2 py-2">
                      <div className="min-w-0">
                        <div className="font-ui text-[var(--t-ui)] text-[var(--text)]">{metric.label}</div>
                        {metric.detail ? <div className="mt-0.5 truncate font-ui text-[var(--t-count)] text-[var(--overlay-1)]">{metric.detail}</div> : null}
                      </div>
                      <InstrumentFigure metric={metric} compact />
                      <button
                        type="button"
                        className="action inline-flex min-w-[70px] items-center justify-center gap-1.5"
                        disabled={pins.isPending}
                        onClick={() => void togglePin(metric).catch((error) => toast.error("Home pin was not saved", { description: error instanceof Error ? error.message : String(error) }))}
                        aria-pressed={pinned}
                      >
                        {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        {pinned ? "Unpin" : "Pin"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {section === "Attention" && snapshot.data.waiting.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {snapshot.data.waiting.map((item) => (
                    <div key={item.id} className="flex items-baseline justify-between gap-4 px-2 py-1 font-ui text-[var(--t-meta)]">
                      <span className="min-w-0 truncate text-[var(--subtext-0)]">{item.label} · {item.detail}</span>
                      <span className="shrink-0 font-mono tabular-nums text-[var(--wait)]">{formatDuration(Date.now() - item.since)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })
      )}

      {(snapshot.data?.errors.length ?? 0) > 0 ? (
        <p className="text-[var(--t-count)] leading-4 text-[var(--overlay-1)]" role="status">
          Some sources are unavailable; their rows show the data that could be read.
        </p>
      ) : null}
    </div>
  );
}
