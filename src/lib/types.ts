export interface VaultDocument {
  id: number;
  title: string;
  source_path: string | null;
  document_type: string;
  domain: string;
  taxonomy?: TaxonomyMetadata | null;
  content?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type TaxonomyEntity =
  | "genzen"
  | "genzen_solutions"
  | "gokart_studio"
  | "founder_context"
  | "archive";

export interface WorkspaceEntity {
  slug: TaxonomyEntity | string;
  label: string;
  status: "active" | "archived" | string;
  created_at: string;
  updated_at: string;
}

export type TaxonomyArea =
  | "company_hq"
  | "revenue"
  | "client_work"
  | "internal_ops"
  | "product_systems"
  | "research_intelligence"
  | "founder_context";

export interface TaxonomyMetadata {
  entity?: TaxonomyEntity | string;
  entity_label?: string;
  area?: TaxonomyArea | string;
  area_label?: string;
  folder?: string;
  object_type?: string;
  routing_rule?: string;
  [key: string]: unknown;
}

export type OperationStatus = "active" | "on_hold" | "archived";
export type SignalStatus = "new" | "saved" | "dismissed";
export type ProjectType = "report" | "scoping" | "research" | "client_case";
export type ProjectStatus = "active" | "on_hold" | "archived";
export type MonitorFrequency = "daily" | "weekly";
export type MonitorStatus = "active" | "paused";
export type SearchMode =
  | "internal"
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
  entity?: string;
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

export type FionaInboxStatus = "pending" | "in_progress" | "complete" | "blocked" | string;
export type FionaInboxPriority = "low" | "normal" | "high" | "urgent" | string;

export interface FionaInboxItem {
  id: string;
  from_agent: string;
  task: string;
  context: Record<string, unknown> | null;
  priority: FionaInboxPriority;
  status: FionaInboxStatus;
  result: unknown;
  created_at: string;
  updated_at: string;
}

export type AgentWorkSource = "workspace.records";
export type AgentWorkOutcome = "done" | "blocked" | "deferred" | "needs_approval";
export type WorkflowRunStatus = "Queued" | "In progress" | "Blocked" | "Needs approval" | "Done" | "Deferred";

export interface AgentWorkItem {
  id: string;
  source: AgentWorkSource;
  database_id: string;
  title: string;
  status: string | null;
  stage: string | null;
  assignee: string | string[] | null;
  priority: string | null;
  area: WorkspaceDatabaseFieldValue;
  initiative_id: string | null;
  initiative_name?: string | null;
  initiative_agent_owner?: string | null;
  durable_role?: string | null;
  functional_lane?: string | null;
  current_actor?: string | null;
  backup_actor?: string | null;
  approval_needed?: string | null;
  next_step?: string | null;
  latest_note?: string | null;
  latest_receipt?: string | null;
  body_preview: string;
  updated_at: string;
}

export interface AgentProjectItem {
  id: string;
  source: AgentWorkSource;
  database_id: string;
  title: string;
  stage: string | null;
  priority: string | null;
  assignee: string[];
  agent_owner: string | null;
  week_theme: string | null;
  task_ids: string[];
  body_preview: string;
  updated_at: string;
}

export interface AgentWorkReceiptInput {
  summary: string;
  sources_used?: string[];
  actions_taken?: string[];
  files_touched?: string[];
  records_touched?: string[];
  artifacts_created?: string[];
  verification?: string[];
  approval_needed?: string | null;
  blocked_items?: string[];
  follow_up_tasks?: string[];
  next_step?: string | null;
}

export interface AgentWorkFollowupInput {
  title: string;
  assignee?: string;
  priority?: string;
  body?: string;
}

export interface AgentDelegationSourceContext {
  records?: string[];
  documents?: string[];
  artifacts?: string[];
}

export interface DelegateAgentWorkInput {
  parentWorkItemId: string;
  requestedRole: string;
  requestedActor?: string | null;
  reason: string;
  sourceContext?: AgentDelegationSourceContext;
  expectedOutput: string;
  allowedTools?: string[];
  approvalLimits?: string[];
  returnPath: string;
  receiptRequired?: boolean;
  confirmWrite?: boolean;
}

export interface DelegateAgentWorkResult {
  dry_run: boolean;
  child_work_item_id: string | null;
  delegation_id: string;
  status: "preview" | "created";
  child_work_item: AgentWorkItem;
  parent_work_item?: AgentWorkItem | null;
}

export interface VoiceDraftTaskInput {
  transcript: string;
  requestedBy: string;
  sourceRoute?: string | null;
  sourceProvider?: string | null;
  confirmWrite?: boolean;
}

export interface WorkflowTemplateItem {
  id: string;
  workflow_id: string;
  name: string;
  status: string | null;
  entity: string | null;
  owner_role: string | null;
  default_actor: string | null;
  source_document_id: WorkspaceDatabaseFieldValue;
  source_path: string | null;
  trigger: string | null;
  required_inputs: string | null;
  default_routing: string | null;
  approval_gates: string | null;
  expected_output: string | null;
  related_databases: string[];
  receipt_template: string | null;
  success_criteria: string | null;
  failure_behavior: string | null;
  run_ids: string[];
  body_preview: string;
  updated_at: string;
}

export interface WorkflowRunItem {
  id: string;
  name: string;
  status: string | null;
  workflow_record_id: string | null;
  task_id: string | null;
  biz_ops_id: string | null;
  entity_scope: string | null;
  owner_role: string | null;
  actor: string | null;
  trigger_source: string | null;
  current_step: string | null;
  source_documents: string[];
  source_records: string | null;
  context: string | null;
  receipt: string | null;
  started_at: string | null;
  completed_at: string | null;
  body_preview: string;
  updated_at: string;
}

export interface StartWorkflowInput {
  workflowId: string;
  triggerSource: "ui" | "chat" | "monitor" | "agent" | "schedule" | "mcp";
  requestedBy: string;
  entityScope?: string | null;
  taskId?: string | null;
  bizOpsId?: string | null;
  sourceRecords?: string[];
  sourceDocuments?: Array<string | number>;
  context?: Record<string, unknown>;
  config?: Record<string, unknown>;
  requiresApproval?: boolean;
  confirmWrite?: boolean;
  /** Runtime prompt forwarded on dispatch; defaults to the generic run prompt. */
  dispatchPrompt?: string | null;
}

export interface UpdateWorkflowRunInput {
  workflowRunId: string;
  actor: string;
  status?: WorkflowRunStatus;
  currentStep?: string | null;
  summary: string;
  sources?: string[];
  actionsTaken?: string[];
  verification?: string[];
  blockedItems?: string[];
  approvalNeeded?: string | null;
  nextStep?: string | null;
  syncTask?: boolean;
  confirmWrite?: boolean;
  /** work_events audit kind; defaults to workflow_run_update. */
  eventKind?: string;
  /** Recorded on approval decisions, e.g. founder_approval_authority. */
  decisionRole?: string | null;
}

export interface Operation {
  id: number;
  record_id?: string | null;
  entity?: string;
  name: string;
  description: string | null;
  status: OperationStatus;
  taxonomy?: TaxonomyMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  record_id?: string | null;
  entity?: string;
  name: string;
  type: ProjectType;
  watch_domain: string | null;
  status: ProjectStatus;
  notes: string | null;
  operation_id: number | null;
  operation_record_id?: string | null;
  taxonomy?: TaxonomyMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface Monitor {
  id: number;
  entity?: string;
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
  entity?: string;
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

export interface InternalSearchResult {
  source_type: "workspace_record" | "knowledge_document" | "intel_signal" | string;
  source_id: string;
  title: string;
  subtitle: string | null;
  entity: string;
  url: string | null;
  excerpt: string | null;
  rank: number;
  updated_at: string;
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
export type CanvasBackground = "plain" | "dots" | "grid";
export type CanvasShape = "rect" | "pill" | "diamond" | "parallelogram" | "circle";
export type CanvasBorder = "none" | "subtle" | "strong";
export type CanvasTextAlign = "left" | "center" | "right";
export type CanvasLineStyle = "solid" | "dashed";
export type CanvasNodeType = "text" | "group" | "file" | "image";
export type CanvasSide = "top" | "right" | "bottom" | "left";
export type CanvasColorPreset =
  | "default"
  | "rosewater"
  | "flamingo"
  | "mauve"
  | "red"
  | "maroon"
  | "peach"
  | "yellow"
  | "green"
  | "teal"
  | "sky"
  | "sapphire"
  | "blue"
  | "lavender"
  | "rainbow";
export type CanvasColor = CanvasColorPreset | string;

export interface Investigation {
  id: number;
  entity?: string;
  case_id: string;
  operation_id: number | null;
  operation_record_id?: string | null;
  name: string;
  status: InvestigationStatus;
  current_phase: number;
  project_id: number | null;
  project_record_id?: string | null;
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
  taxonomy?: TaxonomyMetadata | null;
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
  project_record_id?: string | null;
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
  project_record_id?: string | null;
  kind: WorkspaceNodeKind;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceNode extends WorkspaceNodeSummary {
  content: string | null;
}

// ── OSINT entity layer (intel schema) ──────────────────────────────────────

export type IntelEntityType = "person" | "organization" | "object" | "location" | "event";
export type AdmiraltyReliability = "A" | "B" | "C" | "D" | "E" | "F";

export interface IntelEntity {
  id: string;
  entity_type: IntelEntityType;
  name: string;
  aliases: string[];
  external_ids: Record<string, unknown>;
  summary: string | null;
  confidence: "confirmed" | "probable" | "possible" | "doubtful" | null;
  first_case_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntelClaim {
  id: string;
  case_id: string | null;
  claim: string;
  entity_ids: string[];
  source_reliability: AdmiraltyReliability | null;
  info_credibility: number | null;
  claim_origin: "osint" | "humint" | "analysis" | null;
  event_date: string | null;
  supporting_signal_ids: number[];
  contradicting_signal_ids: number[];
  recorded_by: string;
  created_at: string;
}

export type WorkspaceDatabaseFieldType =
  | "text"
  | "number"
  | "select"
  | "multiselect"
  | "relation"
  | "rollup"
  | "formula"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "status"
  | "createdAt"
  | "lastEditedAt";

export type WorkspaceDatabaseViewType =
  | "table"
  | "kanban"
  | "list"
  | "gallery"
  | "calendar"
  | "chart"
  | "timeline";

export type WorkspaceDatabaseChartType = "bar" | "line" | "donut" | "pie" | "gauge";
export type WorkspaceDatabaseChartAggregation = "count" | "sum" | "avg" | "min" | "max";
export type WorkspaceDatabaseChartPalette = "blue" | "rose" | "gold" | "teal";
export type WorkspaceDatabaseChartRange = "30d" | "90d" | "365d" | "all";
export type WorkspaceDatabaseChartSeriesMode = "single" | "multi";
export type WorkspaceDatabaseChartOrientation = "vertical" | "horizontal";
export type WorkspaceDatabaseChartLineVariant = "standard" | "profitLoss";

export type WorkspaceDatabaseFieldValue =
  | string
  | number
  | boolean
  | string[]
  | null
  | undefined;

export interface WorkspaceDatabaseRelationConfig {
  targetDatabaseId?: string;
  targetRelationFieldId?: string;
}

export interface WorkspaceDatabaseRollupConfig {
  relationFieldId: string;
  targetFieldId?: string;
  aggregation: "count" | "count_not_empty" | "sum" | "avg" | "min" | "max";
}

export interface WorkspaceDatabaseFormulaConfig {
  expression: string;
}

export interface WorkspaceDatabaseField {
  id: string;
  name: string;
  type: WorkspaceDatabaseFieldType;
  options?: string[];
  optionColors?: Record<string, string>;
  relation?: WorkspaceDatabaseRelationConfig;
  rollup?: WorkspaceDatabaseRollupConfig;
  formula?: WorkspaceDatabaseFormulaConfig;
}

export interface WorkspaceDatabaseViewConfig {
  groupBy?: string;
  sort: Array<{ fieldId: string; direction: "asc" | "desc" }>;
  filter: Array<{ fieldId: string; op: string; value: string }>;
  hiddenFields: string[];
  fieldOrder?: string[];
  columnWidths?: Record<string, number>;
  listPropertyWidth?: number;
  cardCoverField?: string;
  cardFields?: string[];
  chartType?: WorkspaceDatabaseChartType;
  chartValueField?: string;
  chartValueFields?: string[];
  chartAggregation?: WorkspaceDatabaseChartAggregation;
  chartSeriesMode?: WorkspaceDatabaseChartSeriesMode;
  chartOrientation?: WorkspaceDatabaseChartOrientation;
  chartLineVariant?: WorkspaceDatabaseChartLineVariant;
  chartShowXAxis?: boolean;
  chartShowYAxis?: boolean;
  chartGoalValue?: number;
  chartShowLegend?: boolean;
  chartShowGrid?: boolean;
  chartPalette?: WorkspaceDatabaseChartPalette;
  chartRange?: WorkspaceDatabaseChartRange;
  timelineStartField?: string;
  timelineEndField?: string;
  timelineProgressField?: string;
  timelineLabelField?: string;
  timelineColorField?: string;
  timelineViewMode?: "Day" | "Week" | "Month" | "Year";
}

export interface WorkspaceDatabaseSchemaSaveOptions {
  silent?: boolean;
}

export interface WorkspaceDatabaseSummary {
  id: string;
  entity?: string;
  name: string;
  icon: string | null;
  schema: WorkspaceDatabaseField[];
  header_field_ids: string[] | null;
  taxonomy?: TaxonomyMetadata;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDatabase extends WorkspaceDatabaseSummary {}

export interface WorkspaceDatabaseView {
  id: string;
  database_id: string;
  name: string;
  type: WorkspaceDatabaseViewType;
  config: WorkspaceDatabaseViewConfig;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDatabaseRecord {
  id: string;
  database_id: string;
  entity?: string;
  fields: Record<string, WorkspaceDatabaseFieldValue>;
  body: string | null;
  taxonomy?: TaxonomyMetadata;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDatabaseRecordModel {
  id: string;
  _body?: string;
  _createdAt?: string;
  _updatedAt?: string;
  /** True when taxonomy.is_template is set — reusable record template. */
  _isTemplate?: boolean;
  [fieldId: string]: WorkspaceDatabaseFieldValue;
}

export interface WorkspaceDatabaseModel {
  id: string;
  name: string;
  icon?: string | null;
  schema: WorkspaceDatabaseField[];
  taxonomy?: TaxonomyMetadata;
  views: Array<{
    id: string;
    name: string;
    type: WorkspaceDatabaseViewType;
    groupBy?: string;
    cardCoverField?: string;
    cardFields?: string[];
    sort: Array<{ fieldId: string; direction: "asc" | "desc" }>;
    filter: Array<{ fieldId: string; op: string; value: string }>;
    hiddenFields: string[];
    fieldOrder?: string[];
    columnWidths?: Record<string, number>;
    listPropertyWidth?: number;
    chartType?: WorkspaceDatabaseChartType;
    chartValueField?: string;
    chartValueFields?: string[];
    chartAggregation?: WorkspaceDatabaseChartAggregation;
    chartSeriesMode?: WorkspaceDatabaseChartSeriesMode;
    chartOrientation?: WorkspaceDatabaseChartOrientation;
    chartLineVariant?: WorkspaceDatabaseChartLineVariant;
    chartShowXAxis?: boolean;
    chartShowYAxis?: boolean;
    chartGoalValue?: number;
    chartShowLegend?: boolean;
    chartShowGrid?: boolean;
    chartPalette?: WorkspaceDatabaseChartPalette;
    chartRange?: WorkspaceDatabaseChartRange;
    timelineStartField?: string;
    timelineEndField?: string;
    timelineProgressField?: string;
    timelineLabelField?: string;
    timelineColorField?: string;
    timelineViewMode?: "Day" | "Week" | "Month" | "Year";
  }>;
  records: WorkspaceDatabaseRecordModel[];
  headerFieldIds?: string[];
}

export interface WorkspaceDatabaseBundle {
  database: WorkspaceDatabase;
  views: WorkspaceDatabaseView[];
  records: WorkspaceDatabaseRecord[];
  model: WorkspaceDatabaseModel;
}

export interface WorkspaceDatabaseCatalogEntry {
  id: string;
  name: string;
  schema: WorkspaceDatabaseField[];
  headerFieldIds: string[];
  taxonomy?: TaxonomyMetadata;
  records: WorkspaceDatabaseRecordModel[];
  views: WorkspaceDatabaseModel["views"];
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasNodeMeta {
  shape?: CanvasShape;
  border?: CanvasBorder;
  textAlign?: CanvasTextAlign;
}

export interface CanvasSceneMeta {
  background?: CanvasBackground;
  snapToGrid?: boolean;
  viewport?: CanvasViewport;
}

export interface CanvasNodeData {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  groupId?: string;
  text?: string;
  label?: string;
  color?: CanvasColor;
  file?: string;
  url?: string;
  sogo?: CanvasNodeMeta;
}

export interface CanvasEdgeData {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  color?: CanvasColor;
  lineStyle?: CanvasLineStyle;
  arrow?: boolean;
}

export interface CanvasDocumentData {
  nodes: CanvasNodeData[];
  edges: CanvasEdgeData[];
  sogo?: CanvasSceneMeta;
}

export interface CanvasDocumentSummary {
  id: number;
  name: string;
  project_id: number | null;
  project_record_id?: string | null;
  case_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasDocument extends CanvasDocumentSummary {
  content_json: CanvasDocumentData;
}
