import type { TaxonomyMetadata } from "@/lib/types";

export const INTEL_WORK_TYPES = [
  { value: "client_case", label: "Client case", description: "Client work with Scoping, Discovery, Report, and Live stages." },
  { value: "venture_research", label: "Venture research", description: "Research for a venture or opportunity, without client-case stages." },
  { value: "publication_research", label: "Publication research", description: "Research feeding an article, brief, or publication." },
  { value: "relationship_research", label: "Relationship research", description: "People and organisation research for relationship decisions." },
] as const;

export type IntelWorkType = (typeof INTEL_WORK_TYPES)[number]["value"];

export const CLIENT_CASE_STAGES = [
  { value: "scoping", label: "Scoping" },
  { value: "discovery", label: "Discovery" },
  { value: "report", label: "Report" },
  { value: "live", label: "Live" },
] as const;

export type ClientCaseStage = (typeof CLIENT_CASE_STAGES)[number]["value"];

const WORK_TYPE_VALUES = new Set<string>(INTEL_WORK_TYPES.map((item) => item.value));
const CASE_STAGE_VALUES = new Set<string>(CLIENT_CASE_STAGES.map((item) => item.value));

export function getIntelWorkType(taxonomy?: TaxonomyMetadata | null): IntelWorkType | null {
  const value = taxonomy?.work_type;
  return typeof value === "string" && WORK_TYPE_VALUES.has(value)
    ? value as IntelWorkType
    : null;
}

export function intelWorkTypeLabel(workType: IntelWorkType | null): string {
  if (!workType) return "Unclassified work item";
  return INTEL_WORK_TYPES.find((item) => item.value === workType)?.label ?? "Work item";
}

export function getClientCaseStage(taxonomy?: TaxonomyMetadata | null): ClientCaseStage | null {
  if (getIntelWorkType(taxonomy) !== "client_case") return null;
  const value = taxonomy?.case_stage;
  return typeof value === "string" && CASE_STAGE_VALUES.has(value)
    ? value as ClientCaseStage
    : "scoping";
}

export function withIntelWorkType(
  taxonomy: TaxonomyMetadata | null | undefined,
  workType: IntelWorkType,
): TaxonomyMetadata {
  const next: TaxonomyMetadata = { ...(taxonomy ?? {}), work_type: workType };
  if (workType === "client_case") {
    next.case_stage = getClientCaseStage(next) ?? "scoping";
  } else {
    delete next.case_stage;
  }
  return next;
}

export function withClientCaseStage(
  taxonomy: TaxonomyMetadata | null | undefined,
  stage: ClientCaseStage,
): TaxonomyMetadata {
  return {
    ...(taxonomy ?? {}),
    work_type: "client_case",
    case_stage: stage,
  };
}
