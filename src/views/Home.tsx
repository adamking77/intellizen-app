import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Layout } from "react-grid-layout";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { PinnedViewGrid, type PinnedDatabaseWidgetModel } from "@/components/home/pinned-view-grid";
import {
  loadHomePins,
  patchHomePinPlacements,
  removeHomePinById,
  restoreHomePin,
  saveHomePins,
  supportsPinnedHomeView,
  type HomePin,
  type HomePinPlacement,
} from "@/lib/home-pins";
import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import { loadGenuiPins, unpinGenuiWidget, type GenuiPin } from "@/lib/genui-pins";
import {
  loadHomeDashboardLayout,
  mergeHomeDashboardLayout,
  pinnedDatabaseRecordPath,
  saveHomeDashboardLayout,
  type HomeDashboardLayoutItem,
} from "@/lib/home-dashboard";
import {
  listHomePinsFromWorkspace,
  listWorkspaceDatabaseCatalog,
  listWorkspaceEntities,
  saveHomePinsToWorkspace,
} from "@/lib/data";
import { currentRotation, type RotationWeek } from "@/lib/rotation";
import { useAppStore } from "@/store";
import { toast } from "@/lib/toast";

const ROTATION_ACCENTS: Record<RotationWeek, string> = {
  Build: "var(--teal)",
  Marketing: "var(--peach)",
  Ops: "var(--yellow)",
  Slack: "var(--lavender)",
};

export function HomeView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [pins, setPins] = useState<HomePin[]>(() => loadHomePins());
  const [genuiPins, setGenuiPins] = useState<GenuiPin[]>(() => loadGenuiPins());
  const [layout, setLayout] = useState<HomeDashboardLayoutItem[]>(() => loadHomeDashboardLayout());
  const pinMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const rotation = currentRotation();
  const { data: workspaceEntities = [] } = useQuery({
    queryKey: ["workspace-entities"],
    queryFn: listWorkspaceEntities,
    staleTime: 10 * 60_000,
  });
  const {
    data: catalog = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-database-catalog", entityFilter],
    queryFn: () => listWorkspaceDatabaseCatalog({ entity: entityFilter }),
    staleTime: 0,
    refetchOnMount: "always",
    networkMode: "always",
  });
  const {
    data: workspacePins,
    isLoading: isLoadingPins,
    error: pinsError,
  } = useQuery({
    queryKey: ["home-pins"],
    // Remote pins are authoritative, including an empty list. Restoring local
    // cache when remote is empty resurrects widgets after a confirmed unpin.
    queryFn: listHomePinsFromWorkspace,
    staleTime: 0,
    refetchOnMount: "always",
    networkMode: "always",
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

  const activeEntityLabel = entityFilter
    ? workspaceEntities.find((entity) => entity.slug === entityFilter)?.label ?? entityFilter.replace(/_/g, " ")
    : "All entities";

  useEffect(() => {
    const validIds = new Set(pinnedWidgets.map((widget) => widget.pin.id));
    // A remote pin can arrive before the catalog refresh that contains its
    // newly created view. Keep unresolved pins in source state; deleting them
    // here races MCP writes and silently removes valid dashboard widgets.
    if (layout.some((item) => !validIds.has(item.id))) {
      setLayout((current) => current.filter((item) => validIds.has(item.id)));
    }
  }, [layout, pinnedWidgets]);

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

  const applyAuthoritativePins = useCallback((nextPins: HomePin[]) => {
    const nextLayout = nextPins.map((pin) => ({
      id: pin.id,
      x: pin.x,
      y: pin.y,
      w: pin.w,
      h: pin.h,
    }));
    setPins(nextPins);
    setLayout(nextLayout);
    saveHomePins(nextPins);
    queryClient.setQueryData(["home-pins"], nextPins);
  }, [queryClient]);

  useEffect(() => {
    if (!workspacePins) return;
    applyAuthoritativePins(workspacePins);
  }, [applyAuthoritativePins, workspacePins]);

  function enqueuePinMutation(transform: (current: HomePin[]) => HomePin[]) {
    let authoritative: HomePin[] = [];
    const operation = pinMutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await mutateAuthoritativeHomePins({
          read: listHomePinsFromWorkspace,
          write: saveHomePinsToWorkspace,
          transform,
        });
        authoritative = result.authoritative;
        applyAuthoritativePins(authoritative);
        await queryClient.invalidateQueries({ queryKey: ["home-pins"] });
      });
    pinMutationQueueRef.current = operation.catch(() => undefined);
    return operation.then(() => authoritative);
  }

  async function restoreRemotePinsAfterFailure() {
    try {
      const authoritative = await listHomePinsFromWorkspace();
      applyAuthoritativePins(authoritative);
    } catch {
      await queryClient.invalidateQueries({ queryKey: ["home-pins"] });
    }
  }

  function persistPlacements(placements: HomePinPlacement[]) {
    return enqueuePinMutation((current) => patchHomePinPlacements(current, placements));
  }

  function commitGridLayout(nextGridLayout: Layout) {
    const nextLayoutItems = nextGridLayout.map((item) => ({
      id: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
    setLayout(nextLayoutItems);
    setPins((current) => patchHomePinPlacements(current, nextLayoutItems));
    void persistPlacements(nextLayoutItems).catch((err) => {
      void restoreRemotePinsAfterFailure();
      toast.error("Home layout was not saved", {
        description: errorDescription(err),
        action: {
          label: "Retry",
          onClick: () => {
            void persistPlacements(nextLayoutItems).catch((retryErr) => {
              void restoreRemotePinsAfterFailure();
              toast.error("Home layout was not saved", { description: errorDescription(retryErr) });
            });
          },
        },
      });
    });
  }

  function handleRemovePin(pinId: string) {
    const removedPin = pins.find((pin) => pin.id === pinId);
    if (!removedPin) return;
    setPins((current) => removeHomePinById(current, pinId));
    setLayout((current) => current.filter((item) => item.id !== pinId));
    void enqueuePinMutation((current) => removeHomePinById(current, pinId))
      .then(() => {
        toast.success("View removed from Home", {
          action: {
            label: "Undo",
            onClick: () => {
              setPins((current) => restoreHomePin(current, removedPin));
              void enqueuePinMutation((current) => restoreHomePin(current, removedPin)).catch((err) => {
                void restoreRemotePinsAfterFailure();
                toast.error("View could not be restored", { description: errorDescription(err) });
              });
            },
          },
        });
      })
      .catch((err) => {
        void restoreRemotePinsAfterFailure();
        toast.error("View was not removed from Home", {
          description: errorDescription(err),
          action: {
            label: "Retry",
            onClick: () => handleRemovePin(pinId),
          },
        });
      });
  }

  if (error || pinsError) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-3 py-4 sm:px-6">
          <span className="text-label">Home unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {error instanceof Error
              ? error.message
              : pinsError instanceof Error
                ? pinsError.message
                : "The dashboard could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-3 py-4 sm:gap-6 sm:px-6">
        <div className="flex flex-col gap-2">
          <span className="text-label">Home</span>
          <p
            className="font-ui text-[12px]"
            style={{ color: ROTATION_ACCENTS[rotation.week] }}
          >
            {rotation.week} week · {rotation.daysRemaining} days remaining
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-ui text-[11px] text-[var(--subtext-0)]">
          Scope · {activeEntityLabel}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
        <section className="mx-auto flex w-full max-w-[1600px] flex-col">
          {isLoading || isLoadingPins ? (
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
              onOpenRecord={(widget, recordId) =>
                navigate(pinnedDatabaseRecordPath(widget.database.id, widget.view.id, recordId))
              }
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

function errorDescription(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "The shared Home Pins database did not accept the change.";
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
