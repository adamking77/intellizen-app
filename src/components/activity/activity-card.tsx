import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { XAxis } from "@/components/charts/x-axis";
import { useSessionStore } from "@/engine/session-store";
import { requestAgentPanelOpen } from "@/lib/agent-panel-persistence";
import { formatDuration } from "@/lib/activity";
import {
  finite,
  type ActivityCardId,
  type ActivityDashboardModel,
  type ActivityItem,
  type ActivitySources,
  type SourceRead,
} from "@/lib/activity-dashboard";

const META = "font-ui text-[var(--t-meta)] leading-5 text-[var(--text-muted)]";
export function money(amount: number | null, currency = "USD") {
  if (amount === null) return "Not reported";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
export function SourceNote({ source }: { source: SourceRead<unknown> }) {
  return (
    <p className={`${META} mt-3`} role={source.error ? "status" : undefined}>
      {source.error
        ? source.at
          ? "Refresh unavailable · showing last read "
          : "Source unavailable"
        : "Updated "}
      {source.at ? (
        <time dateTime={new Date(source.at).toISOString()}>
          {new Date(source.at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      ) : null}
    </p>
  );
}
function ItemList({ items, empty }: { items: ActivityItem[]; empty: string }) {
  const [all, setAll] = useState(false),
    navigate = useNavigate();
  function open(item: ActivityItem) {
    if (item.target.type === "run")
      navigate(`/workflows?run=${encodeURIComponent(item.target.id)}`);
    else if (item.target.type === "providers")
      navigate("/settings?section=providers");
    else {
      const store = useSessionStore.getState();
      if (item.target.type === "room") store.selectRoom(item.target.id);
      else store.selectProfile(item.target.id);
      requestAgentPanelOpen();
    }
  }
  if (!items.length) return <p className={`${META} py-5`}>{empty}</p>;
  return (
    <div className="space-y-1">
      {(all ? items : items.slice(0, 4)).map((item) => (
        <button
          key={item.id}
          className="group flex w-full items-start gap-3 rounded-[var(--r-ctl)] px-2 py-2.5 text-left hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
          onClick={() => open(item)}
        >
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-ui text-[var(--t-ui)] text-[var(--text)]">
              {item.title}
            </p>
            <p className={META}>
              {item.owner} · {item.state}
              {item.since
                ? ` · ${formatDuration(Date.now() - item.since)}`
                : ""}
            </p>
            {item.target.type !== "providers" ? (
              <p className="text-[var(--t-count)] text-[var(--overlay-1)]">
                {item.updated
                  ? `Last activity ${formatDuration(Date.now() - item.updated)} ago`
                  : "Last activity not reported"}
              </p>
            ) : null}
          </div>
          <ArrowUpRight
            aria-hidden
            className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]"
          />
        </button>
      ))}
      {items.length > 4 ? (
        <button
          className="action mt-2"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? "Show less" : `Show all ${items.length}`}
        </button>
      ) : null}
    </div>
  );
}

/** Identical body in Activity, Home and workspace widgets. */
export function ActivityCardBody({
  id,
  model,
  sources,
}: {
  id: ActivityCardId;
  model: ActivityDashboardModel;
  sources: ActivitySources;
}) {
  const navigate = useNavigate();
  if (id === "attention" || id === "progress")
    return (
      <>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-light tabular-nums">
            {(id === "attention" ? model.attention : model.progress).length}
          </span>
          <span className={META}>
            {id === "attention" ? "to review" : "active now"}
          </span>
        </div>
        <ItemList
          items={id === "attention" ? model.attention : model.progress}
          empty={
            id === "attention"
              ? "Nothing waiting in the available sources."
              : "No active work in the available sources."
          }
        />
        {model.workspaceScoped ? (
          <p className={META}>
            Only conversations with a known project folder. Team and workflow
            ownership is not yet reported by workspace.
          </p>
        ) : null}
        <SourceNote source={sources.runs} />
      </>
    );
  if (id === "outcomes")
    return (
      <>
        <p className={META}>Workflow runs · latest state in this period</p>
        {model.workspaceScoped ? (
          <p className={`${META} py-5`}>
            Workspace ownership is not reported for workflow runs yet.
          </p>
        ) : !sources.runs.data ? (
          <p className={`${META} py-5`}>Workflow outcomes are unavailable.</p>
        ) : model.periodRuns.length ? (
          <>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-light tabular-nums">
                {model.outcomes[0].count}
                <span className="text-lg text-[var(--overlay-1)]">
                  {" "}
                  / {model.periodRuns.length}
                </span>
              </span>
              <span className={META}>completed</span>
            </div>
            <div
              role="img"
              aria-label={model.outcomes
                .map((o) => `${o.name}: ${o.count}`)
                .join(", ")}
            >
              <BarChart
                data={model.outcomes.filter((o) => o.count > 0)}
                xDataKey="name"
                aspectRatio="2.8 / 1"
                margin={{ top: 12, bottom: 28, left: 8, right: 8 }}
                animationDuration={0}
              >
                <Bar
                  dataKey="count"
                  animate={false}
                  fill="var(--chart-line-primary)"
                />
                <BarXAxis />
              </BarChart>
            </div>
            <details className={META}>
              <summary className="cursor-pointer rounded-[var(--r-ctl)] py-2 hover:bg-[var(--hover)]">
                Counts and coverage
              </summary>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                {model.outcomes.map((o) => (
                  <div key={o.name} className="flex justify-between gap-3">
                    <dt>{o.name}</dt>
                    <dd className="font-mono tabular-nums">{o.count}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2">
                Each run counts once. Deferred stays distinct from cancelled.
                Completion does not imply a verified output. Conversation turns
                and schedule runs are not included.
              </p>
              {(sources.runs.data?.length ?? 0) >= 1000 ? (
                <p>
                  Limited to the latest 1,000 runs; older results may be
                  missing.
                </p>
              ) : null}
            </details>
          </>
        ) : (
          <p className={`${META} py-5`}>
            No recorded workflow outcomes in this period.
          </p>
        )}
        <SourceNote source={sources.runs} />
      </>
    );
  if (id === "usage")
    return (
      <>
        <p className={META}>
          {model.workspaceScoped
            ? "Period totals cannot yet be attributed to a workspace."
            : "Costs for Hermes sessions started in this period · USD"}
        </p>
        <div className="my-3 flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <p className="font-mono text-2xl font-light tabular-nums">
              {money(model.reported)}
            </p>
            <p className={META}>Reported subtotal</p>
          </div>
          {model.estimated !== null ? (
            <div>
              <p className="font-mono text-2xl font-light tabular-nums">
                {money(model.estimated)}
              </p>
              <p className={META}>Estimated separately</p>
            </div>
          ) : null}
        </div>
        {model.usageDays.filter(
          (d) => d.reported !== null || d.estimated !== null,
        ).length > 1 ? (
          <div
            role="img"
            aria-label="Session cost by start day; reported and estimated values are separate, missing days have gaps"
          >
            <LineChart
              data={model.usageDays}
              aspectRatio="2.8 / 1"
              margin={{ top: 12, left: 8, right: 8, bottom: 28 }}
              animationDuration={0}
            >
              <Line
                dataKey="reported"
                animate={false}
                showHighlight={false}
                fadeEdges={false}
              />
              <Line
                dataKey="estimated"
                stroke="var(--chart-line-secondary)"
                animate={false}
                showHighlight={false}
                fadeEdges={false}
              />
              <XAxis numTicks={3} />
            </LineChart>
          </div>
        ) : (
          <p className={`${META} py-2`}>
            Not enough daily reports for a trend.
          </p>
        )}
        {!model.workspaceScoped ? (
          <p className={META}>
            {model.usageReporting} of {model.usageExpected} Hermes profiles
            reported cost. CLI lifetime usage is separate below.
          </p>
        ) : null}
        <details className={`${META} mt-2`}>
          <summary className="cursor-pointer rounded-[var(--r-ctl)] py-2 hover:bg-[var(--hover)]">
            Live sessions & daily reports
          </summary>
          <p>
            Historical costs are grouped by session start date, not
            billing-event date. Estimates may cover the same sessions as
            reported costs and are never added to them. Hermes returns zero for
            absent costs, so a zero aggregate is shown as Not reported.
          </p>
          <p>
            Latest cumulative values from sessions open in this app. These are
            not selected-period totals or account limits.
          </p>
          {model.liveUsage.length ? (
            model.liveUsage.map((t) => {
              const u = t.transcript.usage;
              const cost =
                u?.cost && typeof u.cost === "object"
                  ? (u.cost as { amount?: unknown; currency?: unknown })
                  : null;
              return (
                <div
                  key={t.profile}
                  className="border-t border-[var(--border-subtle)] py-2"
                >
                  <p className="text-[var(--text)]">
                    {sources.profiles.data?.find((p) => p.name === t.profile)
                      ?.displayName || t.profile}
                  </p>
                  <p>
                    Cost:{" "}
                    {money(
                      finite(cost?.amount),
                      typeof cost?.currency === "string"
                        ? cost.currency
                        : "USD",
                    )}{" "}
                    · Tokens:{" "}
                    {finite(u?.total)?.toLocaleString() ?? "Not reported"}
                  </p>
                  <p>
                    Context:{" "}
                    {finite(u?.context_used)?.toLocaleString() ??
                      "Not reported"}{" "}
                    /{" "}
                    {finite(u?.context_max)?.toLocaleString() ?? "Not reported"}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="py-2">No live session usage available.</p>
          )}
          {Object.entries(sources.usage).map(([name, report]) => (
            <div key={name}>
              <span>
                {sources.profiles.data?.find((p) => p.name === name)
                  ?.displayName || name}
              </span>
              <SourceNote source={report} />
            </div>
          ))}
          {model.usageDays
            .filter((d) => d.reported !== null || d.estimated !== null)
            .map((d) => (
              <p key={d.day}>
                {d.day} ·{" "}
                {d.reported === null
                  ? "Reported cost unavailable"
                  : `${money(d.reported)} reported`}
                {d.estimated !== null
                  ? ` · ${money(d.estimated)} estimated`
                  : ""}{" "}
                · {d.reporting} profiles
              </p>
            ))}
        </details>
        {Object.values(sources.usage).some((r) => r.error) ? (
          <p className={`${META} mt-2`} role="status">
            Some usage reads are stale or unavailable. Last successful values
            are retained.
          </p>
        ) : null}
      </>
    );
  return (
    <>
      <p className={`${META} mb-2`}>
        Runtime availability · global configuration
      </p>
      {model.connections.map((c) => (
        <button
          key={c.id}
          onClick={() => navigate("/settings?section=providers")}
          className="flex w-full items-center gap-3 rounded-[var(--r-ctl)] px-2 py-2.5 text-left hover:bg-[var(--hover)]"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-ui text-[var(--t-ui)] text-[var(--text)]">
              {c.name}
            </span>
            <span className={META}>{c.detail}</span>
          </span>
          <span className={`${META} shrink-0`}>{c.state}</span>
        </button>
      ))}
      {!model.connections.length ? (
        <p className={`${META} py-3`}>
          Connection information is unavailable for this scope.
        </p>
      ) : null}
      <SourceNote source={sources.connections} />
    </>
  );
}
