import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Layout } from "react-grid-layout";
import { Loader2, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  PinnedViewGrid,
  type PinnedDatabaseWidgetModel,
  type PinnedHomeWidgetModel,
} from "@/components/home/pinned-view-grid";
import {
  loadHomePins,
  createDatabaseHomePin,
  isDatabaseViewHomePin,
  isGenuiHomePin,
  patchHomePinPlacements,
  patchHomePinMetadata,
  removeHomePinById,
  restoreHomePin,
  saveHomePins,
  supportsPinnedHomeView,
  type HomePin,
  type HomePinPlacement,
} from "@/lib/home-pins";
import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import { loadGenuiPins, migrateLegacyGenuiPins } from "@/lib/genui-pins";
import { buildHomeWidgetPresets, isHomeWidgetPresetPinned, type HomeWidgetPreset } from "@/lib/home-widget-presets";
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
  const [layout, setLayout] = useState<HomeDashboardLayoutItem[]>(() => loadHomeDashboardLayout());
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const pinMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const legacyGenuiMigrationStartedRef = useRef(false);
  const rotation = currentRotation();
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

  const pinnedWidgets = useMemo<PinnedHomeWidgetModel[]>(() => {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    return pins
      .map((pin): PinnedHomeWidgetModel | null => {
        if (isGenuiHomePin(pin)) return { kind: "genui", pin };
        const database = catalogById.get(pin.databaseId);
        const view = database?.views.find((candidate) => candidate.id === pin.viewId);
        if (!database || !view || !supportsPinnedHomeView(view.type)) return null;
        return { kind: "database-view", pin, database, view } satisfies PinnedDatabaseWidgetModel;
      })
      .filter((widget): widget is PinnedHomeWidgetModel => Boolean(widget));
  }, [catalog, pins]);

  const widgetPresets = useMemo(() => buildHomeWidgetPresets(catalog), [catalog]);
  const databasePins = useMemo(() => pins.filter(isDatabaseViewHomePin), [pins]);

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

  useEffect(() => {
    if (!workspacePins || legacyGenuiMigrationStartedRef.current || loadGenuiPins().length === 0) return;
    legacyGenuiMigrationStartedRef.current = true;
    void migrateLegacyGenuiPins({
      read: listHomePinsFromWorkspace,
      write: saveHomePinsToWorkspace,
    }).then((authoritativeGenuiPins) => {
      if (authoritativeGenuiPins.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ["home-pins"] });
      }
    }).catch((migrationError) => {
      legacyGenuiMigrationStartedRef.current = false;
      toast.error("Generated widgets could not be moved to shared Home Pins", {
        description: errorDescription(migrationError),
      });
    });
  }, [queryClient, workspacePins]);

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

  function handleUpdateWidgetMetadata(
    pinId: string,
    metadata: Parameters<typeof patchHomePinMetadata>[2],
  ) {
    void enqueuePinMutation((current) => patchHomePinMetadata(current, pinId, metadata))
      .then(() => toast.success("Widget updated"))
      .catch((err) => {
        void restoreRemotePinsAfterFailure();
        toast.error("Widget settings were not saved", { description: errorDescription(err) });
      });
  }

  function handleAddWidgetPreset(preset: HomeWidgetPreset) {
    if (isHomeWidgetPresetPinned(databasePins, preset)) return;
    setWidgetPickerOpen(false);
    void enqueuePinMutation((current) => {
      if (isHomeWidgetPresetPinned(current.filter(isDatabaseViewHomePin), preset)) return current;
      return [...current, createDatabaseHomePin(current, {
        databaseId: preset.databaseId,
        viewId: preset.viewId,
        title: preset.title,
        filter: preset.filter,
        config: preset.config,
      })];
    }).then(() => {
      toast.success(`${preset.label} added to Home`);
    }).catch((err) => {
      void restoreRemotePinsAfterFailure();
      toast.error(`${preset.label} was not added`, { description: errorDescription(err) });
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
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--base)] px-3 py-4 sm:px-6">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
        <section className="mx-auto flex w-full max-w-[1600px] flex-col">
          <div className="relative mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setWidgetPickerOpen((open) => !open)}
              aria-expanded={widgetPickerOpen}
              aria-haspopup="menu"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--mantle)] px-3 font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add widget
            </button>
            {widgetPickerOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-[300px] rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-2 shadow-[var(--shadow-elevated)]"
              >
                <div className="mb-1 flex items-center justify-between px-2 py-1">
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Available widgets</span>
                  <button
                    type="button"
                    onClick={() => setWidgetPickerOpen(false)}
                    aria-label="Close widget picker"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {widgetPresets.length === 0 ? (
                  <p className="px-2 py-3 font-ui text-[11px] text-[var(--overlay-1)]">No database widgets are available in this scope.</p>
                ) : widgetPresets.map((preset) => {
                  const pinned = isHomeWidgetPresetPinned(databasePins, preset);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="menuitem"
                      disabled={pinned}
                      onClick={() => handleAddWidgetPreset(preset)}
                      className="block w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--surface-wash)] disabled:opacity-50"
                    >
                      <span className="block font-ui text-[12px] font-medium text-[var(--text)]">
                        {preset.label}{pinned ? " · Added" : ""}
                      </span>
                      <span className="mt-0.5 block font-ui text-[10px] leading-4 text-[var(--overlay-1)]">{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
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
              onUpdateWidgetMetadata={(widget, metadata) => handleUpdateWidgetMetadata(widget.pin.id, metadata)}
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
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--mantle)] px-3 py-1.5 font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                Open Databases
              </button>
            </div>
          )}

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
