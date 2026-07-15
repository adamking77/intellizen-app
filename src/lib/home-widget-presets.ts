import { supportsPinnedHomeView, type HomeDatabaseViewPin } from "@/lib/home-pins";
import { DOCUMENTS_DB_FIELDS } from "@/lib/documents";
import type { WorkspaceDatabaseCatalogEntry } from "@/lib/types";

const AGENT_WORK_DATABASE_ID = "654acc9c-0270-49e2-86f7-788e25c59a76";
const WORKFLOW_REGISTRY_DATABASE_ID = "c1000000-0000-0000-0000-000000000001";

export interface HomeWidgetPreset {
  id: "daily-brief" | "agent-work" | "workflows" | "roles";
  label: string;
  description: string;
  databaseId: string;
  viewId: string;
  title: string;
  filter?: HomeDatabaseViewPin["filter"];
  config: Record<string, unknown>;
}

export function buildHomeWidgetPresets(catalog: WorkspaceDatabaseCatalogEntry[]): HomeWidgetPreset[] {
  const documents = catalog.find((database) =>
    database.name === "Documents" || database.taxonomy?.object_type === "documents_database"
  );
  const agentWork = catalog.find((database) => database.id === AGENT_WORK_DATABASE_ID);
  const workflows = catalog.find((database) => database.id === WORKFLOW_REGISTRY_DATABASE_ID);
  const agentWorkView = findWidgetView(agentWork);
  const documentsView = findWidgetView(documents);
  const workflowView = findWidgetView(workflows);
  const roleField = workflows?.schema.find((field) =>
    field.id === "workflow_owner_role" || field.name.toLowerCase() === "owner role"
  );

  return [
    ...(documents && documentsView ? [{
      id: "daily-brief" as const,
      label: "Daily Brief",
      description: "Today’s Fiona-produced operating brief from Docs.",
      databaseId: documents.id,
      viewId: documentsView.id,
      title: "Daily Brief",
      filter: [
        { fieldId: DOCUMENTS_DB_FIELDS.docType, op: "equals", value: "daily-brief" },
        { fieldId: DOCUMENTS_DB_FIELDS.createdAt, op: "is_today", value: "" },
      ],
      config: { presetKey: "daily-brief" },
    }] : []),
    ...(agentWork && agentWorkView ? [{
      id: "agent-work" as const,
      label: "Agent Work",
      description: "Open and delegated work from the Tasks database.",
      databaseId: agentWork.id,
      viewId: agentWorkView.id,
      title: "Agent Work",
      config: { presetKey: "agent-work" },
    }] : []),
    ...(workflows && workflowView ? [{
      id: "workflows" as const,
      label: "Workflows",
      description: "Registered workflows and their current operating status.",
      databaseId: workflows.id,
      viewId: workflowView.id,
      title: "Workflows",
      config: { presetKey: "workflows" },
    }] : []),
    ...(workflows && workflowView && roleField ? [{
      id: "roles" as const,
      label: "Roles",
      description: "Workflow ownership grouped by durable role.",
      databaseId: workflows.id,
      viewId: workflowView.id,
      title: "Roles",
      config: { presetKey: "roles", groupBy: roleField.id },
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
