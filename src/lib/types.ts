export interface VaultDocument {
  id: number;
  title: string;
  source_path: string;
  document_type: string;
  domain: string;
  content?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type OperationStatus = "active" | "archived";
export type SignalStatus = "new" | "saved" | "dismissed";
export type ProjectType = "report" | "scoping" | "research" | "client_case";
export type ProjectStatus = "active" | "archived";
export type MonitorFrequency = "daily" | "weekly";
export type MonitorStatus = "active" | "paused";
export type SearchMode =
  | "web"
  | "news"
  | "research_papers"
  | "company"
  | "people"
  | "financial_reports"
  | "deep_research";
export type GraphEntityType = "person" | "organisation" | "location" | "event";

export interface IntelSignal {
  id: number;
  monitor_id: number | null;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  snippet: string | null;
  watch_domain: string | null;
  exa_score: number | null;
  raw_payload: unknown;
  status: SignalStatus;
  created_at: string;
  updated_at: string;
}

export interface Operation {
  id: number;
  name: string;
  description: string | null;
  status: OperationStatus;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  type: ProjectType;
  watch_domain: string | null;
  status: ProjectStatus;
  notes: string | null;
  operation_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Monitor {
  id: number;
  name: string;
  query: string;
  watch_domain: string;
  frequency: MonitorFrequency;
  status: MonitorStatus;
  last_run: string | null;
  signal_count: number;
  created_at: string;
}

export interface ProjectSignal {
  id: number;
  project_id: number;
  signal_id: number;
  notes: string | null;
  added_at: string;
  intel_signals: IntelSignal | null;
}

export interface SignalDraft {
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  snippet: string | null;
  watch_domain: string;
  exa_score: number | null;
  raw_payload: unknown;
  status?: SignalStatus;
}

export interface MonitorInsert {
  name: string;
  query: string;
  watch_domain: string;
  frequency: MonitorFrequency;
  status?: MonitorStatus;
}

export interface SearchResultItem {
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  snippet: string | null;
  exa_score: number | null;
  raw_payload: unknown;
}

export interface DeepResearchResult {
  title: string;
  url: string;
  source: string;
  snippet: string;
  content: string;
  raw_payload: unknown;
}

export interface GraphNodeRecord {
  id: number;
  project_id: number | null;
  node_id: string;
  label: string;
  entity_type: GraphEntityType;
  position_x: number;
  position_y: number;
  created_at: string;
  updated_at: string;
}

export interface GraphEdgeRecord {
  id: number;
  project_id: number | null;
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}

// V2: Investigations
export type InvestigationStatus = "active" | "archived" | "completed";
export type InvestigationUseCase = "scoping" | "post" | "sit_rep";
export type VaultFileType = "plan" | "collect" | "collate" | "timeline" | "ach" | "report" | "sweep" | "assessment" | "brief" | "analysis" | "graph_export";
export type ReportType = "internal" | "client" | "deep" | "public";
export type WorkspaceNodeKind = "folder" | "file";

export interface Investigation {
  id: number;
  case_id: string;
  operation_id: number | null;
  name: string;
  status: InvestigationStatus;
  current_phase: number;
  project_id: number | null;
  use_case: InvestigationUseCase;
  subject_definition: string | null;
  investigation_scope: string | null;
  scope_notes: string | null;
  humint_input: string | null;
  plan_proportionality: boolean;
  plan_legality: boolean;
  plan_accountability: boolean;
  plan_necessity: boolean;
  seed_entities: string[];
  known_hypotheses: string[];
  phase_gates: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface InvestigationSignal {
  id: number;
  investigation_id: number;
  signal_id: number;
  phase_added: number;
  notes: string | null;
  added_at: string;
  intel_signals?: IntelSignal;
}

export interface VaultFile {
  id: number;
  case_id: string | null;
  project_id: number | null;
  phase: number | null;
  file_type: VaultFileType;
  file_path: string;
  file_name: string;
  report_type: ReportType | null;
  generated_by: string;
  content: string | null;
  created_at: string;
}

export interface WorkspaceNodeSummary {
  id: number;
  parent_id: number | null;
  case_id: string | null;
  project_id: number | null;
  kind: WorkspaceNodeKind;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceNode extends WorkspaceNodeSummary {
  content: string | null;
}
