import type { TaxonomyMetadata, WorkspaceDatabaseSummary } from "@/lib/types";

export const TAXONOMY_ENTITY_OPTIONS = [
  { value: "genzen", label: "GenZen" },
  { value: "genzen_solutions", label: "GenZen Solutions" },
  { value: "gokart_studio", label: "GoKart Studio" },
  { value: "founder_context", label: "Founder Context" },
] as const;

export const TAXONOMY_AREA_OPTIONS = [
  { value: "company_hq", label: "Company HQ" },
  { value: "revenue", label: "Revenue" },
  { value: "client_work", label: "Client Work" },
  { value: "internal_ops", label: "Internal Ops" },
  { value: "product_systems", label: "Product & Systems" },
  { value: "research_intelligence", label: "Research & Intelligence" },
  { value: "founder_context", label: "Founder Context" },
] as const;

export const TAXONOMY_ENTITY_LABELS: Record<string, string> = {
  genzen: "GenZen",
  genzen_solutions: "GenZen Solutions",
  gokart_studio: "GoKart Studio",
  founder_context: "Founder Context",
  archive: "Archive",
};

export const TAXONOMY_AREA_LABELS: Record<string, string> = {
  company_hq: "Company HQ",
  revenue: "Revenue",
  client_work: "Client Work",
  internal_ops: "Internal Ops",
  product_systems: "Product & Systems",
  research_intelligence: "Research & Intelligence",
  founder_context: "Founder Context",
};

export function taxonomyEntityLabel(taxonomy?: TaxonomyMetadata | null) {
  const entity = typeof taxonomy?.entity === "string" ? taxonomy.entity : "";
  if (typeof taxonomy?.entity_label === "string" && taxonomy.entity_label.trim()) {
    return taxonomy.entity_label;
  }
  return TAXONOMY_ENTITY_LABELS[entity] ?? "Unfiled";
}

export function ventureScopeLabel(entity?: string | null) {
  if (!entity) return "All ventures";
  return TAXONOMY_ENTITY_LABELS[entity] ?? entity.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function taxonomyAreaLabel(taxonomy?: TaxonomyMetadata | null) {
  const area = typeof taxonomy?.area === "string" ? taxonomy.area : "";
  if (typeof taxonomy?.area_label === "string" && taxonomy.area_label.trim()) {
    return taxonomy.area_label;
  }
  return TAXONOMY_AREA_LABELS[area] ?? "Unfiled";
}

export function taxonomyFolderLabel(taxonomy?: TaxonomyMetadata | null) {
  return typeof taxonomy?.folder === "string" && taxonomy.folder.trim()
    ? taxonomy.folder
    : "Unfiled";
}

export function taxonomyBreadcrumb(taxonomy?: TaxonomyMetadata | null) {
  const entity = taxonomyEntityLabel(taxonomy);
  const area = taxonomyAreaLabel(taxonomy);
  const folder = taxonomyFolderLabel(taxonomy);
  return [entity, area, folder].filter((part, index, parts) => part !== "Unfiled" || index === parts.length - 1);
}

export function buildTaxonomyMetadata(input: {
  entity: string;
  area: string;
  folder?: string;
  objectType?: string;
  routingRule?: string;
}): TaxonomyMetadata {
  const entityLabel = TAXONOMY_ENTITY_LABELS[input.entity] ?? input.entity;
  const areaLabel = TAXONOMY_AREA_LABELS[input.area] ?? input.area;
  return {
    entity: input.entity,
    entity_label: entityLabel,
    area: input.area,
    area_label: areaLabel,
    folder: input.folder?.trim() || areaLabel,
    object_type: input.objectType,
    routing_rule: input.routingRule,
  };
}

export function groupWorkspaceDatabasesByEntity(databases: WorkspaceDatabaseSummary[]) {
  const groups = new Map<string, WorkspaceDatabaseSummary[]>();

  for (const database of databases) {
    const entity = taxonomyEntityLabel(database.taxonomy);
    const bucket = groups.get(entity) ?? [];
    bucket.push(database);
    groups.set(entity, bucket);
  }

  return Array.from(groups.entries()).map(([entity, items]) => ({
    entity,
    items,
  }));
}
