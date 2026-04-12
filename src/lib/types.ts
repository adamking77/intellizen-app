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

export interface Project {
  id: number;
  name: string;
  type: ProjectType;
  watch_domain: string | null;
  status: ProjectStatus;
  notes: string | null;
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
  project_id: number;
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
  project_id: number;
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}
