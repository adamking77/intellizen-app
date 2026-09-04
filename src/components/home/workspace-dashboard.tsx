import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Layout } from "react-grid-layout";
import { Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  PinnedViewGrid,
  type PinnedDatabaseWidgetModel,
  type PinnedHomeWidgetModel,
} from "@/components/home/pinned-view-grid";
import { Control } from "@/components/ui/control";
import { EmptyState, FailureState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { listHomePinsFromWorkspace, listWorkspaceDatabaseCatalog, saveHomePinsToWorkspace } from "@/lib/data";
import { pinnedDatabaseRecordPath } from "@/lib/home-dashboard";
import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import {
  configForDashboard,
  createDatabaseHomePin,
  isDatabaseViewHomePin,
  isGenuiHomePin,
  isInstrumentHomePin,
  isPluginHomePin,
  patchHomePinMetadata,
  patchHomePinPlacements,
  pinsForDashboard,
  removeHomePinById,
  restoreHomePin,
  supportsPinnedHomeView,
  type DashboardScope,
  type HomePin,
} from "@/lib/home-pins";
import { errorMessage, toast } from "@/lib/toast";

export function WorkspaceDashboard({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queue = useRef(Promise.resolve());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const scope = `workspace:${workspaceId}` as DashboardScope;
  const catalog = useQuery({ queryKey: ["workspace-database-catalog", "unit"], queryFn: () => listWorkspaceDatabaseCatalog(), staleTime: 0 });
  const pins = useQuery({ queryKey: ["home-pins"], queryFn: listHomePinsFromWorkspace, staleTime: 0 });
  const scopedPins = useMemo(() => pinsForDashboard(pins.data ?? [], scope), [pins.data, scope]);
  const widgets = useMemo<PinnedHomeWidgetModel[]>(() => {
    const byId = new Map((catalog.data ?? []).map((entry) => [entry.id, entry]));
    return scopedPins.flatMap((pin): PinnedHomeWidgetModel[] => {
      if (isGenuiHomePin(pin)) return [{ kind: "genui", pin }];
      if (isPluginHomePin(pin)) return [{ kind: "plugin", pin }];
      if (isInstrumentHomePin(pin)) return [{ kind: "instrument", pin }];
      const database = byId.get(pin.databaseId);
      const view = database?.views.find((candidate) => candidate.id === pin.viewId);
      return database && view && supportsPinnedHomeView(view.type)
        ? [{ kind: "database-view", pin, database, view } satisfies PinnedDatabaseWidgetModel]
        : [];
    });
  }, [catalog.data, scopedPins]);
  const availableViews = useMemo(() => (catalog.data ?? []).flatMap((database) =>
    database.views.filter((view) => supportsPinnedHomeView(view.type)).map((view) => ({ database, view }))
  ), [catalog.data]);
  const layout = useMemo<Layout>(() => scopedPins.map((pin) => ({
    i: pin.id, x: pin.x, y: pin.y, w: pin.w, h: pin.h, minW: 4, minH: 8,
  })), [scopedPins]);

  function mutate(transform: (current: HomePin[]) => HomePin[]) {
    setSaving(true);
    let result: HomePin[] = [];
    const operation = queue.current.catch(() => undefined).then(async () => {
      const mutation = await mutateAuthoritativeHomePins({
        read: listHomePinsFromWorkspace,
        write: saveHomePinsToWorkspace,
        transform,
      });
      result = mutation.authoritative;
      queryClient.setQueryData(["home-pins"], result);
    });
    queue.current = operation.catch(() => undefined);
    return operation.finally(() => setSaving(false)).then(() => result);
  }

  function addView(databaseId: string, viewId: string) {
    setPickerOpen(false);
    void mutate((current) => {
      const scoped = pinsForDashboard(current, scope);
      if (scoped.some((pin) => isDatabaseViewHomePin(pin) && pin.databaseId === databaseId && pin.viewId === viewId)) return current;
      return [...current, createDatabaseHomePin(current, {
        databaseId,
        viewId,
        config: configForDashboard(undefined, scope),
      })];
    }).then(() => toast.success(`Widget added to ${workspaceName}`)).catch((error) => {
      toast.error("Widget was not added", { description: errorMessage(error) });
    });
  }

  function removePin(pin: HomePin) {
    void mutate((current) => removeHomePinById(current, pin.id)).then(() => {
      toast.success(`Widget removed from ${workspaceName}`, {
        action: {
          label: "Undo",
          onClick: () => void mutate((current) => restoreHomePin(current, pin)).catch((error) => toast.error("Widget could not be restored", { description: errorMessage(error) })),
        },
      });
    }).catch((error) => toast.error("Widget was not removed", { description: errorMessage(error) }));
  }

  const picker = pickerOpen ? (
    <div role="menu" className="absolute right-0 top-full z-40 mt-2 max-h-[min(520px,calc(100vh-180px))] w-[min(320px,calc(100vw-40px))] overflow-y-auto rounded-[var(--r-plane)] bg-[var(--mantle)] p-2 shadow-[var(--shadow-elevated)]">
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="text-label">Database views</span>
        <Control size="icon" variant="quiet" aria-label="Close widget picker" onClick={() => setPickerOpen(false)}><X className="h-3.5 w-3.5" /></Control>
      </div>
      {availableViews.length ? availableViews.map(({ database, view }) => {
        const added = scopedPins.some((pin) => isDatabaseViewHomePin(pin) && pin.databaseId === database.id && pin.viewId === view.id);
        return (
          <button key={`${database.id}:${view.id}`} type="button" role="menuitem" disabled={added || saving} onClick={() => addView(database.id, view.id)} className="block w-full rounded-[var(--r-ctl)] px-2 py-2 text-left hover:bg-[var(--hover)] disabled:opacity-50">
            <span className="block truncate text-[var(--t-meta)] text-[var(--text)]">{view.name}{added ? " · Added" : ""}</span>
            <span className="mt-0.5 block truncate text-[var(--t-count)] text-[var(--text-muted)]">{database.name} · {view.type}</span>
          </button>
        );
      }) : <p className="px-2 py-3 text-[var(--t-meta)] text-[var(--text-muted)]">No pinnable database views are available.</p>}
    </div>
  ) : null;

  if (pins.isLoading || catalog.isLoading) return <Skeleton lines={4} className="px-3 py-4" />;
  if (pins.error || catalog.error) return <FailureState message={`Dashboard could not be read: ${errorMessage(pins.error ?? catalog.error)}`} action={{ label: "Retry", onClick: () => void Promise.all([pins.refetch(), catalog.refetch()]) }} />;

  return (
    <section aria-label={`${workspaceName} dashboard`}>
      <div className="relative mb-3 flex justify-end">
        <Control variant="quiet" disabled={saving} aria-expanded={pickerOpen} aria-haspopup="menu" onClick={() => setPickerOpen((open) => !open)}><Plus className="h-3.5 w-3.5" />Add widget</Control>
        {picker}
      </div>
      {widgets.length ? (
        <PinnedViewGrid
          widgets={widgets}
          catalog={catalog.data ?? []}
          layout={layout}
          onLayoutChange={(next) => void mutate((current) => patchHomePinPlacements(current, next.map((item) => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h })))).catch((error) => toast.error("Dashboard layout was not saved", { description: errorMessage(error) }))}
          onOpenWidget={(widget) => navigate(`/databases/${widget.database.id}?view=${widget.view.id}`)}
          onOpenRecord={(widget, recordId) => navigate(pinnedDatabaseRecordPath(widget.database.id, widget.view.id, recordId))}
          onRemoveWidget={(widget) => removePin(widget.pin)}
          onUpdateWidgetMetadata={(widget, metadata) => void mutate((current) => patchHomePinMetadata(current, widget.pin.id, { ...metadata, config: configForDashboard(metadata.config, scope) })).catch((error) => toast.error("Widget settings were not saved", { description: errorMessage(error) }))}
        />
      ) : (
        <EmptyState title="No widgets yet" description="Pin an existing database view here for this workspace." action={{ label: "Add widget", onClick: () => setPickerOpen(true) }} />
      )}
    </section>
  );
}
