import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Layout } from "react-grid-layout";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { PinnedViewGrid, type PinnedDatabaseWidgetModel } from "@/components/home/pinned-view-grid";
import {
  loadHomePins,
  saveHomePins,
  supportsPinnedHomeView,
  type HomePin,
} from "@/lib/home-pins";
import { loadGenuiPins, unpinGenuiWidget, type GenuiPin } from "@/lib/genui-pins";
import {
  loadHomeDashboardLayout,
  mergeHomeDashboardLayout,
  saveHomeDashboardLayout,
  type HomeDashboardLayoutItem,
} from "@/lib/home-dashboard";
import { listWorkspaceDatabaseCatalog } from "@/lib/data";
import { currentRotation, type RotationWeek } from "@/lib/rotation";

const ROTATION_ACCENTS: Record<RotationWeek, string> = {
  Build: "var(--teal)",
  Marketing: "var(--peach)",
  Ops: "var(--yellow)",
  Slack: "var(--lavender)",
};

export function HomeView() {
  const navigate = useNavigate();
  const [pins, setPins] = useState<HomePin[]>(() => loadHomePins());
  const [genuiPins, setGenuiPins] = useState<GenuiPin[]>(() => loadGenuiPins());
  const [layout, setLayout] = useState<HomeDashboardLayoutItem[]>(() => loadHomeDashboardLayout());
  const rotation = currentRotation();
  const {
    data: catalog = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-database-catalog"],
    queryFn: listWorkspaceDatabaseCatalog,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    saveHomePins(pins);
  }, [pins]);

  useEffect(() => {
    saveHomeDashboardLayout(layout);
  }, [layout]);

  const pinnedWidgets = useMemo<PinnedDatabaseWidgetModel[]>(() => {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    return pins
      .map((pin): PinnedDatabaseWidgetModel | null => {
        const database = catalogById.get(pin.databaseId);
        const view = database?.views.find((candidate) => candidate.id === pin.viewId);
        if (!database || !view || !supportsPinnedHomeView(view.type)) return null;
        return { pin, database, view };
      })
      .filter((widget): widget is PinnedDatabaseWidgetModel => Boolean(widget));
  }, [catalog, pins]);

  useEffect(() => {
    const validIds = new Set(pinnedWidgets.map((widget) => widget.pin.id));

    if (validIds.size !== pins.length) {
      setPins((current) => current.filter((pin) => validIds.has(pin.id)));
    }

    if (layout.some((item) => !validIds.has(item.id))) {
      setLayout((current) => current.filter((item) => validIds.has(item.id)));
    }
  }, [layout, pins.length, pinnedWidgets]);

  const gridLayout = useMemo<Layout>(
    () =>
      mergeHomeDashboardLayout(
        pinnedWidgets.map((widget) => widget.pin),
        layout,
      ).map((item) => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: 4,
        minH: 8,
      })),
    [layout, pinnedWidgets],
  );

  function commitGridLayout(nextLayout: Layout) {
    setLayout(
      nextLayout.map((item) => ({
        id: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })),
    );
  }

  function handleRemovePin(pinId: string) {
    setPins((current) => current.filter((pin) => pin.id !== pinId));
    setLayout((current) => current.filter((item) => item.id !== pinId));
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Home unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {error instanceof Error ? error.message : "The dashboard could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-2">
          <span className="text-label">Home</span>
          <p
            className="font-ui text-[12px]"
            style={{ color: ROTATION_ACCENTS[rotation.week] }}
          >
            {rotation.week} week · {rotation.daysRemaining} days remaining
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <section className="mx-auto flex w-full max-w-[1600px] flex-col">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 font-ui text-[13px] text-[var(--overlay-1)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading pinned views...</span>
            </div>
          ) : pinnedWidgets.length > 0 ? (
            <PinnedViewGrid
              widgets={pinnedWidgets}
              catalog={catalog}
              layout={gridLayout}
              onLayoutChange={commitGridLayout}
              onOpenWidget={(widget) => navigate(`/databases/${widget.database.id}?view=${widget.view.id}`)}
              onRemoveWidget={(widget) => handleRemovePin(widget.pin.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
              <p className="font-ui text-[14px] font-medium text-[var(--subtext-0)]">
                No pinned views
              </p>
              <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                Open a database view and pin it to see it here.
              </p>
              <button
                type="button"
                onClick={() => navigate("/databases")}
                className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-1.5 font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                Open Databases
              </button>
            </div>
          )}

          {genuiPins.length > 0 ? (
            <div className="mt-6">
              <div className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Agent widgets
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {genuiPins.map((pin) => (
                  <AgentWidgetCard key={pin.id} pin={pin} onUnpin={() => setGenuiPins(unpinGenuiWidget(pin.id))} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/**
 * A pinned agent-built widget. html widgets run in the GenUI sandbox and
 * re-query Supabase on every mount — Refresh remounts the frame, so the
 * widget re-pulls live data.
 */
function AgentWidgetCard({ pin, onUnpin }: { pin: GenuiPin; onUnpin: () => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--mantle)] px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          {pin.title}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {pin.widget.kind === "html" ? (
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              className="font-ui text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              Refresh
            </button>
          ) : null}
          <button
            type="button"
            onClick={onUnpin}
            className="font-ui text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)] transition-colors hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            Unpin
          </button>
        </span>
      </div>
      {/* Card header already shows the title; suppress the widget's own. */}
      <AgentChatWidget key={refreshKey} widget={{ ...pin.widget, title: undefined }} />
    </div>
  );
}
