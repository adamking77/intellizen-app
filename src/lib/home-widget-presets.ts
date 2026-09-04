import { supportsPinnedHomeView, type HomeDatabaseViewPin } from "@/lib/home-pins";
import type { WorkspaceDatabaseCatalogEntry } from "@/lib/types";

const WORKFLOW_REGISTRY_DATABASE_ID = "c1000000-0000-0000-0000-000000000001";

export interface HomeWidgetPreset {
  id: "workflows";
  label: string;
  description: string;
  databaseId: string;
  viewId: string;
  title: string;
  filter?: HomeDatabaseViewPin["filter"];
  config: Record<string, unknown>;
}

export function buildHomeWidgetPresets(catalog: WorkspaceDatabaseCatalogEntry[]): HomeWidgetPreset[] {
  const workflows = catalog.find((database) => database.id === WORKFLOW_REGISTRY_DATABASE_ID);
  const workflowView = findWidgetView(workflows);

  return [
    ...(workflows && workflowView ? [{
      id: "workflows" as const,
      label: "Workflows",
      description: "Registered workflows and their current operating status.",
      databaseId: workflows.id,
      viewId: workflowView.id,
      title: "Workflows",
      config: { presetKey: "workflows" },
    }] : []),
  ];
}

export function isHomeWidgetPresetPinned(pins: HomeDatabaseViewPin[], preset: HomeWidgetPreset) {
  return pins.some((pin) => pin.config?.presetKey === preset.id);
}

function findWidgetView(database?: WorkspaceDatabaseCatalogEntry) {
  if (!database) return null;
  return database.views.find((view) => view.type === "list" || view.type === "table")
    ?? database.views.find((view) => supportsPinnedHomeView(view.type))
    ?? null;
}
