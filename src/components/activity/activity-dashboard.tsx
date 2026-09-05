import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pin, RefreshCw } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { AppDialog } from "@/components/ui/app-dialog";
import { ActivityCardBody } from "./activity-card";
import { useActivity } from "./use-activity";
import {
  ACTIVITY_CARDS,
  ACTIVITY_TITLES,
  activityFilter,
  type ActivityCardId,
} from "@/lib/activity-dashboard";
import { pinActivityCard, activityPinFilter, activityChartStyle } from "@/lib/activity-pins";
import { listHomePinsFromWorkspace, saveHomePinsToWorkspace } from "@/lib/data";
import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import type { DashboardScope, HomeInstrumentPin } from "@/lib/home-pins";
import { usePreference } from "@/lib/settings-preferences";
import { toast } from "@/lib/toast";

export function ActivityDashboard() {
  const [chartRaw, saveCharts] = usePreference("intelizen:activity-charts", "{}");
  let charts: Record<string, unknown> = {};
  try { const parsed = JSON.parse(chartRaw); if (parsed && typeof parsed === "object") charts = parsed; } catch { /* Use the default views. */ }
  const [raw, saveFilter] = usePreference("intelizen:activity-filter", "{}");
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = {};
  }
  const filter = activityFilter(stored);
  const query = useActivity(filter),
    client = useQueryClient();
  const pinTrigger = useRef<HTMLButtonElement | null>(null);
  function closePin() {
    setPinning(null);
    requestAnimationFrame(() => pinTrigger.current?.focus());
  }
  const [pinning, setPinning] = useState<ActivityCardId | null>(null),
    [destination, setDestination] = useState<DashboardScope>("home"),
    [saving, setSaving] = useState(false);
  const workspaces =
    query.data?.hierarchy.data?.filter((n) => n.kind === "workspace") ?? [];
  const setFilter = (patch: Partial<typeof filter>) =>
    saveFilter(JSON.stringify({ ...filter, ...patch }));
  async function pin() {
    if (!pinning || saving) return;
    setSaving(true);
    try {
      const result = await mutateAuthoritativeHomePins({
        read: listHomePinsFromWorkspace,
        write: saveHomePinsToWorkspace,
        transform: (pins) =>
          pinActivityCard(
            pins,
            pinning,
            ACTIVITY_TITLES[pinning],
            filter,
            destination,
            activityChartStyle(pinning, charts[pinning]),
          ),
      });
      client.setQueryData(["home-pins"], result.authoritative);
      const expected = pinActivityCard(
        [],
        pinning,
        ACTIVITY_TITLES[pinning],
        filter,
        destination,
        activityChartStyle(pinning, charts[pinning]),
      ).at(-1);
      if (
        expected &&
        !result.authoritative.some(
          (p) =>
            p.kind === "instrument" &&
            p.instrumentId === `activity.${pinning}` &&
            JSON.stringify(p.config) === JSON.stringify(expected.config),
        )
      )
        throw new Error(
          "The saved widget could not be confirmed. Please retry.",
        );
      toast.success(
        `Pinned to ${destination === "home" ? "Home" : workspaces.find((w) => `workspace:${w.id}` === destination)?.name || "workspace"}`,
      );
      closePin();
    } catch (error) {
      toast.error("Widget was not saved", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }
  const errors = query.data
    ? [
        query.data.runs,
        query.data.connections,
        query.data.profiles,
        query.data.hierarchy,
        query.data.sessionFolders,
        ...Object.values(query.data.usage),
      ].filter((s) => s.error)
    : [];
  return (
    <div className="@container space-y-5 pb-5">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 grow">
          <h1 className="font-ui text-[var(--t-title)] font-light uppercase tracking-[0.16em] text-[var(--text)]">
            Activity
          </h1>
          <p className="mt-1 text-[var(--t-meta)] text-[var(--text-muted)]">
            Decisions, live work, and usage across your agents.
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
        <Select
          aria-label="Activity period"
          value={filter.days}
          onChange={(e) =>
            setFilter({ days: e.target.value === "30" ? 30 : 7 })
          }
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </Select>
        <Select
          aria-label="Activity workspace"
          value={filter.workspace}
          containerClassName="max-w-full"
          onChange={(e) => setFilter({ workspace: e.target.value })}
        >
          <option value="all">All workspaces</option>
          {filter.workspace !== "all" &&
          !workspaces.some((w) => w.id === filter.workspace) ? (
            <option value={filter.workspace}>Unavailable workspace</option>
          ) : null}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <button
          className="action p-2"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-label="Refresh activity"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        </div>
      </header>
      <details className="text-[var(--t-meta)] text-[var(--text-muted)]">
        <summary className="w-fit cursor-pointer rounded-[var(--r-ctl)] py-1 hover:bg-[var(--hover)]">
          {filter.agent === "all"
            ? "Filter by agent or team"
            : "Agent / team filter active"}
        </summary>
        <Select
          aria-label="Activity agent or team"
          value={filter.agent}
          onChange={(e) => setFilter({ agent: e.target.value })}
          containerClassName="mt-2 max-w-full"
        >
          <option value="all">All agents and teams</option>
          {query.data?.profiles.data?.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName || p.name}
            </option>
          ))}
          {Object.entries(query.rooms)
            .filter(([, r]) => !r.tombstone)
            .map(([id, r]) => (
              <option key={id} value={`room:${id}`}>
                {r.name} · Team
              </option>
            ))}
        </Select>
      </details>
      {errors.length ? (
        <p
          role="status"
          className="text-[var(--t-meta)] text-[var(--text-muted)]"
        >
          Some sources could not refresh. Available data remains visible;
          timestamps identify the last successful read.
        </p>
      ) : null}
      {query.isPending ? (
        <div
          role="status"
          aria-label="Loading activity"
          className="grid gap-4 @[640px]:grid-cols-2"
        >
          {ACTIVITY_CARDS.map((id) => (
            <div
              key={id}
              className="h-48 animate-pulse rounded-[var(--r-plane)] bg-[var(--mantle)]"
            />
          ))}
        </div>
      ) : query.model && query.data ? (
        <div className="grid items-stretch gap-3 @[560px]:grid-cols-6">
          {(["attention", "progress", "connections", "usage", "outcomes"] as const).map((id) => (
            <section
              key={id}
              aria-labelledby={`activity-${id}`}
              className={`min-w-0 rounded-[var(--r-plane)] bg-[var(--mantle)] p-4 ${id === "usage" || id === "outcomes" ? "@[560px]:col-span-6 @[1000px]:col-span-3" : "@[560px]:col-span-2"}`}
            >
              <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2
                  id={`activity-${id}`}
                  className="mr-auto font-ui text-[var(--t-ui)] text-[var(--text-muted)]"
                >
                  {ACTIVITY_TITLES[id]}
                </h2>
                {id === "usage" || id === "outcomes" ? <Segmented kind="choice"
                  label={`${ACTIVITY_TITLES[id]} chart display`}
                  value={activityChartStyle(id, charts[id])}
                  options={(id === "usage" ? ["line", "bar"] : ["ring", "bar"]).map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
                  onValueChange={(style) => saveCharts(JSON.stringify({ ...charts, [id]: style }))}
                /> : null}
                <button
                  className="action p-1.5"
                  aria-label={`Pin ${ACTIVITY_TITLES[id]} to a dashboard`}
                  onClick={(event) => {
                    pinTrigger.current = event.currentTarget;
                    setPinning(id);
                    setDestination(
                      filter.workspace === "all"
                        ? "home"
                        : `workspace:${filter.workspace}`,
                    );
                  }}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
              </header>
              <ActivityCardBody
                id={id}
                model={query.model!}
                sources={query.data}
                chartStyle={activityChartStyle(id, charts[id])}
              />
            </section>
          ))}
        </div>
      ) : (
        <p role="alert">Activity could not be read. Use Refresh to retry.</p>
      )}
      <p className="text-[var(--t-count)] leading-5 text-[var(--overlay-1)]">
        Live conversations include connected Hermes and ACP agents. External
        terminal sessions require an integration to appear. Periods use UTC
        calendar days; current work and connections are live.
      </p>
      <AppDialog
        open={pinning !== null}
        title={pinning ? `Pin ${ACTIVITY_TITLES[pinning]}` : "Pin activity"}
        onOpenChange={(open) => {
          if (!open && !saving) closePin();
        }}
      >
        <div className="space-y-4 p-4">
          <label className="flex flex-col gap-2 text-[var(--t-meta)]">
            Dashboard
            <Select
              value={destination}
              onChange={(e) => setDestination(e.target.value as DashboardScope)}
            >
              <option value="home">Home</option>
              {workspaces.map((w) => (
                <option key={w.id} value={`workspace:${w.id}`}>
                  {w.name}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-[var(--t-meta)] text-[var(--text-muted)]">
            Saves the chart display, current period and agent filter.
            {destination !== "home"
              ? " This widget will show only activity attributable to this workspace. Connections remain labeled as global configuration."
              : " The current workspace filter is preserved."}
          </p>
          <div className="flex justify-end gap-2">
            <button className="action" disabled={saving} onClick={closePin}>
              Cancel
            </button>
            <button
              className="action"
              disabled={saving}
              onClick={() => void pin()}
            >
              {saving ? "Saving…" : "Pin widget"}
            </button>
          </div>
        </div>
      </AppDialog>
    </div>
  );
}

export function ActivityWidget({
  pin,
  card,
}: {
  pin: HomeInstrumentPin;
  card: ActivityCardId;
}) {
  const filter = activityPinFilter(pin),
    query = useActivity(filter);
  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-3 text-[var(--t-count)] text-[var(--text-muted)]">
        Last {filter.days} days ·{" "}
        {filter.workspace === "all"
          ? "All workspaces"
          : query.data?.hierarchy.data?.find((w) => w.id === filter.workspace)
              ?.name || "Workspace"}
        {filter.agent !== "all"
          ? ` · ${query.data?.profiles.data?.find((p) => p.name === filter.agent)?.displayName || "Filtered target"}`
          : ""}
      </p>
      {query.model && query.data ? (
        <ActivityCardBody id={card} model={query.model!} sources={query.data} chartStyle={activityChartStyle(card, pin.config?.chartStyle)} />
      ) : (
        <p role="status">
          {query.isPending ? "Loading activity…" : "Activity unavailable"}
        </p>
      )}
    </div>
  );
}
