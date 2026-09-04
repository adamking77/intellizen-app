import { listAcpProviderStatuses } from "@/engine/acp-registry";
import { useEngineStore } from "@/engine/engine-store";
import { hermesRest } from "@/engine/rest";
import { useSessionStore } from "@/engine/session-store";
import { listWorkflowRuns } from "@/lib/data";
import { listWorkEvents, type WorkEventItem } from "@/lib/data/work-receipts";
import { fetchHermesProfiles } from "@/services/agent";
import type { HermesProfile } from "@/engine/profiles";
import { listCronJobRuns, listCronJobs, type CronJobRun } from "@/services/hermes-cron";
import { listHermesSidebarSessions, type HermesProjectSession } from "@/services/hermes-project-sessions";

export type ActivitySection = "Agents" | "Engine" | "Work" | "Attention";
export type ActivityTone = "good" | "bad" | "waiting";

export interface ActivityMetric {
  id: string;
  section: ActivitySection;
  label: string;
  value: string;
  word: string;
  detail?: string;
  sparkline: number[];
  tone?: ActivityTone;
}

export interface ActivityWaitingItem {
  id: string;
  label: string;
  since: number;
  detail: string;
}

export interface ActivitySnapshot {
  metrics: ActivityMetric[];
  waiting: ActivityWaitingItem[];
  updatedAt: number;
  errors: string[];
}

interface UsageTotals {
  total_input?: number;
  total_output?: number;
  total_estimated_cost?: number;
  total_actual_cost?: number;
  total_sessions?: number;
}

interface UsageDay {
  day?: string;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost?: number;
  actual_cost?: number;
  sessions?: number;
}

interface UsageAnalytics {
  daily?: UsageDay[];
  totals?: UsageTotals;
}

interface ModelAnalytics {
  models?: Array<{ tool_calls?: number }>;
}

interface AgentActivityInput {
  name: string;
  displayName: string;
  usage: UsageAnalytics | null;
  modelUsage: ModelAnalytics | null;
  sessions: HermesProjectSession[];
  turnTimes: number[];
}

export interface BuildActivityInput {
  now: number;
  agents: AgentActivityInput[];
  engine: {
    connected: boolean;
    startedAt: string | null;
    acpReachable: number;
  };
  events: WorkEventItem[];
  workflowRuns: Array<{ id: string; name: string; status: string | null; current_step: string | null; started_at: string | null; updated_at: string }>;
  cronRuns: CronJobRun[];
  pendingDecisions: Array<{ id: string; profile: string; at: number; detail: string }>;
}

const DAY_MS = 86_400_000;

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metric(input: Omit<ActivityMetric, "sparkline"> & { sparkline?: number[] }): ActivityMetric {
  return { ...input, sparkline: input.sparkline ?? [] };
}

function agentSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
}

function lastSevenDays(now: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now - (6 - index) * DAY_MS);
    return date.toISOString().slice(0, 10);
  });
}

function dailyValues(rows: UsageDay[], now: number, pick: (row: UsageDay) => number) {
  const byDay = new Map(rows.map((row) => [row.day ?? "", pick(row)]));
  return lastSevenDays(now).map((day) => byDay.get(day) ?? 0);
}

function eventValues(events: WorkEventItem[], now: number, match: (event: WorkEventItem) => boolean) {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!match(event)) continue;
    const day = event.created_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return lastSevenDays(now).map((day) => counts.get(day) ?? 0);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCost(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 2 : 0 }).format(value);
}

export function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "—";
  if (milliseconds < 60_000) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function eventKind(event: WorkEventItem, ...kinds: string[]) {
  return kinds.includes(event.event_kind);
}

function documentCreated(event: WorkEventItem) {
  if (!eventKind(event, "record.created")) return false;
  const database = String(event.payload.database_id ?? event.payload.database_name ?? "").toLowerCase();
  return database.includes("document");
}

function decisionWaits(events: WorkEventItem[]) {
  const requests = new Map<string, number[]>();
  const waits: number[] = [];
  for (const event of [...events].sort((left, right) => left.created_at.localeCompare(right.created_at))) {
    const key = event.workflow_run_id ?? event.record_id ?? "";
    if (!key) continue;
    const at = Date.parse(event.created_at);
    if (!Number.isFinite(at)) continue;
    if (eventKind(event, "approval_request", "approval_requested")) {
      const queue = requests.get(key) ?? [];
      queue.push(at);
      requests.set(key, queue);
    } else if (eventKind(event, "approval_decision", "approval_granted", "approval_denied")) {
      const requestedAt = requests.get(key)?.shift();
      if (requestedAt !== undefined && at >= requestedAt) waits.push(at - requestedAt);
    }
  }
  return waits;
}

export function buildActivitySnapshot(input: BuildActivityInput): ActivitySnapshot {
  const metrics: ActivityMetric[] = [];
  for (const agent of input.agents) {
    const slug = agentSlug(agent.name);
    const daily = agent.usage?.daily ?? [];
    const totals = agent.usage?.totals ?? {};
    const today = new Date(input.now).toISOString().slice(0, 10);
    const todaySessions = daily.find((row) => row.day === today)?.sessions ?? 0;
    const sessions = number(totals.total_sessions);
    const tokens = number(totals.total_input) + number(totals.total_output);
    const cost = number(totals.total_actual_cost) || number(totals.total_estimated_cost);
    const toolCalls = (agent.modelUsage?.models ?? []).reduce((sum, row) => sum + number(row.tool_calls), 0);
    const failures = agent.sessions.filter((session) => session.failed).length;
    const averageTurn = agent.turnTimes.length
      ? agent.turnTimes.reduce((sum, duration) => sum + duration, 0) / agent.turnTimes.length
      : 0;
    const common = `${agent.displayName} · last 7 days`;
    metrics.push(
      metric({ id: `agent.${slug}.sessions-today`, section: "Agents", label: `${agent.displayName} sessions`, value: formatInteger(todaySessions), word: "today", detail: common, sparkline: dailyValues(daily, input.now, (row) => number(row.sessions)) }),
      metric({ id: `agent.${slug}.sessions-week`, section: "Agents", label: `${agent.displayName} sessions`, value: formatInteger(sessions), word: "this week", detail: common, sparkline: dailyValues(daily, input.now, (row) => number(row.sessions)) }),
      metric({ id: `agent.${slug}.tokens-week`, section: "Agents", label: `${agent.displayName} tokens`, value: formatCompact(tokens), word: "tokens", detail: common, sparkline: dailyValues(daily, input.now, (row) => number(row.input_tokens) + number(row.output_tokens)) }),
      metric({ id: `agent.${slug}.cost-week`, section: "Agents", label: `${agent.displayName} cost`, value: formatCost(cost), word: "this week", detail: common, sparkline: dailyValues(daily, input.now, (row) => number(row.actual_cost) || number(row.estimated_cost)) }),
      metric({ id: `agent.${slug}.turn-time`, section: "Agents", label: `${agent.displayName} average turn`, value: formatDuration(averageTurn), word: "per turn", detail: "Completed turns in this app run" }),
      metric({ id: `agent.${slug}.tool-calls`, section: "Agents", label: `${agent.displayName} tool calls`, value: formatInteger(toolCalls), word: "this week", detail: common }),
      metric({ id: `agent.${slug}.failures`, section: "Agents", label: `${agent.displayName} failures`, value: formatInteger(failures), word: "this week", detail: common, tone: failures > 0 ? "bad" : undefined }),
    );
  }

  const startedAt = input.engine.startedAt ? Date.parse(input.engine.startedAt) : Number.NaN;
  const connectedFor = input.engine.connected && Number.isFinite(startedAt) ? input.now - startedAt : 0;
  metrics.push(
    metric({ id: "engine.hermes-connected", section: "Engine", label: "Hermes connected", value: input.engine.connected ? formatDuration(connectedFor) : "Offline", word: input.engine.connected ? "uptime" : "now", tone: input.engine.connected ? "good" : "bad" }),
    metric({ id: "engine.acp-reachable", section: "Engine", label: "ACP agents reachable", value: formatInteger(input.engine.acpReachable), word: input.engine.acpReachable === 1 ? "agent" : "agents", tone: input.engine.acpReachable > 0 ? "good" : undefined }),
    metric({ id: "engine.last-restart", section: "Engine", label: "Last Hermes restart", value: Number.isFinite(startedAt) ? formatDuration(input.now - startedAt) : "—", word: Number.isFinite(startedAt) ? "ago" : "not recorded", detail: input.engine.startedAt ?? undefined }),
  );

  const cardsMoved = (event: WorkEventItem) => eventKind(event, "kanban.card_moved");
  const proposalAccepted = (event: WorkEventItem) => eventKind(event, "proposal.accepted", "proposal_accepted");
  const proposalRejected = (event: WorkEventItem) => eventKind(event, "proposal.rejected", "proposal_rejected");
  const decisionAnswered = (event: WorkEventItem) => eventKind(event, "approval_decision", "approval_granted", "approval_denied");
  const workflowStarted = (event: WorkEventItem) => eventKind(event, "workflow_run_started");
  const eventCount = (match: (event: WorkEventItem) => boolean) => input.events.filter(match).length;
  const waits = decisionWaits(input.events);
  const averageDecisionWait = waits.length ? waits.reduce((sum, wait) => sum + wait, 0) / waits.length : 0;
  const cronRuns = input.cronRuns.filter((run) => {
    const startedAt = run.startedAt ? Date.parse(run.startedAt) : Number.NaN;
    return Number.isFinite(startedAt) && startedAt >= input.now - 7 * DAY_MS;
  });
  const cronCompleted = cronRuns.filter((run) => run.outcome === "completed").length;
  const cronIncomplete = cronRuns.filter((run) => run.outcome === "incomplete").length;
  const workspaceCompleted = input.events.filter((event) => eventKind(event, "workflow_completed") || event.payload.status === "Done").length;
  const workspaceIncomplete = input.events.filter((event) => eventKind(event, "blocked", "runtime_abandoned", "persistence_rejected") || event.payload.status === "Blocked").length;
  metrics.push(
    metric({ id: "work.cards-moved", section: "Work", label: "Cards moved", value: formatInteger(eventCount(cardsMoved)), word: "this week", sparkline: eventValues(input.events, input.now, cardsMoved) }),
    metric({ id: "work.documents-written", section: "Work", label: "Documents written", value: formatInteger(eventCount(documentCreated)), word: "this week", sparkline: eventValues(input.events, input.now, documentCreated) }),
    metric({ id: "work.proposals-accepted", section: "Work", label: "Proposals accepted", value: formatInteger(eventCount(proposalAccepted)), word: "this week", detail: "Recorded decisions", sparkline: eventValues(input.events, input.now, proposalAccepted) }),
    metric({ id: "work.proposals-rejected", section: "Work", label: "Proposals rejected", value: formatInteger(eventCount(proposalRejected)), word: "this week", detail: "Recorded decisions", sparkline: eventValues(input.events, input.now, proposalRejected) }),
    metric({ id: "work.decisions-answered", section: "Work", label: "Decisions answered", value: formatInteger(eventCount(decisionAnswered)), word: "this week", sparkline: eventValues(input.events, input.now, decisionAnswered) }),
    metric({ id: "work.decision-wait", section: "Work", label: "Average decision wait", value: formatDuration(averageDecisionWait), word: waits.length ? "per answer" : "no sample" }),
    metric({ id: "work.workflow-runs", section: "Work", label: "Workflow runs", value: formatInteger(eventCount(workflowStarted) + cronRuns.length), word: "this week", sparkline: eventValues(input.events, input.now, workflowStarted) }),
    metric({ id: "work.workflow-outcomes", section: "Work", label: "Workflow outcomes", value: formatInteger(cronCompleted + workspaceCompleted), word: "completed", detail: `${cronIncomplete + workspaceIncomplete} incomplete`, tone: cronIncomplete + workspaceIncomplete > 0 ? "bad" : undefined }),
  );

  const waiting: ActivityWaitingItem[] = [
    ...input.workflowRuns
      .filter((run) => run.status === "Needs approval")
      .map((run) => ({
        id: `workflow:${run.id}`,
        label: run.name,
        since: Date.parse(run.started_at ?? run.updated_at),
        detail: run.current_step ?? "Workflow approval",
      })),
    ...input.pendingDecisions.map((decision) => ({
      id: decision.id,
      label: decision.profile,
      since: decision.at,
      detail: decision.detail,
    })),
  ].filter((item) => Number.isFinite(item.since)).sort((left, right) => left.since - right.since);
  const oldest = waiting[0];
  metrics.push(metric({
    id: "attention.waiting",
    section: "Attention",
    label: "Waits on you",
    value: formatInteger(waiting.length),
    word: waiting.length === 1 ? "item" : "items",
    detail: oldest ? `Oldest ${formatDuration(input.now - oldest.since)} · ${oldest.label}` : "Nothing waiting",
    tone: waiting.length > 0 ? "waiting" : "good",
  }));

  return { metrics, waiting, updatedAt: input.now, errors: [] };
}

async function agentAnalytics(name: string) {
  const profile = encodeURIComponent(name);
  const [usage, models] = await Promise.all([
    hermesRest<UsageAnalytics>(`/api/analytics/usage?days=7&profile=${profile}`),
    hermesRest<ModelAnalytics>(`/api/analytics/models?days=7&profile=${profile}`),
  ]);
  return { usage, models };
}

export async function collectActivitySnapshot(now = Date.now()): Promise<ActivitySnapshot> {
  const errors: string[] = [];
  const settled = await Promise.allSettled([
    fetchHermesProfiles(),
    listHermesSidebarSessions(),
    listAcpProviderStatuses(),
    listWorkEvents({ since: new Date(now - 7 * DAY_MS).toISOString(), limit: 5_000 }),
    listWorkflowRuns({ includeCompleted: false, limit: 500 }),
    listCronJobs("all"),
  ]);
  const value = <T,>(index: number, fallback: T, label: string): T => {
    const result = settled[index];
    if (result.status === "fulfilled") return result.value as T;
    errors.push(`${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return fallback;
  };
  const profiles = value<HermesProfile[]>(0, [], "Agents");
  const sessions = value<HermesProjectSession[]>(1, [], "Sessions");
  const acp = value<Array<{ agentId: string }>>(2, [], "ACP");
  const events = value<WorkEventItem[]>(3, [], "Work events");
  const workflowRuns = value<BuildActivityInput["workflowRuns"]>(4, [], "Workflow runs");
  const cronJobs = value<Array<{ id: string; profile: string }>>(5, [], "Cron jobs");
  const analytics = await Promise.all(profiles.map(async (profile) => {
    try {
      return await agentAnalytics(profile.name);
    } catch (error) {
      errors.push(`${profile.displayName || profile.name}: ${error instanceof Error ? error.message : String(error)}`);
      return { usage: null, models: null };
    }
  }));
  const cronRuns = (await Promise.all(cronJobs.map(async (job) => {
    try {
      return await listCronJobRuns(job.profile, job.id, 25);
    } catch (error) {
      errors.push(`Cron ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }))).flat();
  const threads = useSessionStore.getState().threads;
  const pendingDecisions = Object.values(threads).flatMap((thread) => thread.transcript.pending.map((decision) => ({
    id: `session:${thread.profile}:${decision.requestId}`,
    profile: thread.profile,
    at: decision.at,
    detail: decision.kind === "approval" ? decision.description || decision.command : decision.questions[0]?.question ?? "Question",
  })));
  const snapshot = buildActivitySnapshot({
    now,
    agents: profiles.map((profile, index) => ({
      name: profile.name,
      displayName: profile.displayName || profile.name,
      usage: analytics[index]?.usage ?? null,
      modelUsage: analytics[index]?.models ?? null,
      sessions: sessions.filter((session) => session.profile === profile.name && session.lastActive >= now / 1_000 - 7 * 86_400),
      turnTimes: (threads[profile.name]?.transcript.messages ?? []).flatMap((message) => typeof message.tookMs === "number" ? [message.tookMs] : []),
    })),
    engine: {
      connected: useEngineStore.getState().connection === "open",
      startedAt: useEngineStore.getState().info?.startedAt ?? null,
      acpReachable: acp.length,
    },
    events,
    workflowRuns,
    cronRuns,
    pendingDecisions,
  });
  return { ...snapshot, errors };
}
