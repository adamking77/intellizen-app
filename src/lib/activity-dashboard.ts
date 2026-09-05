import type { ProfileThread } from "@/engine/session-store";
import type { HermesProfile } from "@/engine/profiles";
import type { HierarchyNode } from "./hierarchy";
import { buildTree, projectAt } from "./hierarchy";
import type { WorkflowRunItem } from "./types";
import type { GroupChatRoom } from "@/rooms/group-chat";
import type { GroupPrompt } from "@/rooms/types";

export const ACTIVITY_CARDS = [
  "attention",
  "progress",
  "outcomes",
  "usage",
  "connections",
] as const;
export type ActivityCardId = (typeof ACTIVITY_CARDS)[number];
export const ACTIVITY_TITLES: Record<ActivityCardId, string> = {
  attention: "Needs attention",
  progress: "In progress",
  outcomes: "Outcomes",
  usage: "Usage",
  connections: "Connections",
};
export interface ActivityFilter {
  days: 7 | 30;
  workspace: string;
  agent: string;
}
export const DEFAULT_ACTIVITY_FILTER: ActivityFilter = {
  days: 7,
  workspace: "all",
  agent: "all",
};
export function activityFilter(value: unknown): ActivityFilter {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    days: raw.days === 30 ? 30 : 7,
    workspace: typeof raw.workspace === "string" ? raw.workspace : "all",
    agent: typeof raw.agent === "string" ? raw.agent : "all",
  };
}
export interface SourceRead<T> {
  data: T | null;
  at: number | null;
  error?: string;
}
export interface UsageDay {
  day: string;
  actual_cost?: number;
  estimated_cost?: number;
  input_tokens?: number;
  output_tokens?: number;
}
export interface UsageReport {
  daily?: UsageDay[];
}
export interface ActivityConnection {
  id: string;
  name: string;
  state: "Connected" | "Available" | "Unavailable";
  detail: string;
}
export interface ActivitySources {
  at: number;
  runs: SourceRead<WorkflowRunItem[]>;
  connections: SourceRead<ActivityConnection[]>;
  hierarchy: SourceRead<HierarchyNode[]>;
  usage: Record<string, SourceRead<UsageReport>>;
  profiles: SourceRead<HermesProfile[]>;
  sessionFolders: SourceRead<Record<string, string>>;
}
export interface ActivityItem {
  id: string;
  title: string;
  owner: string;
  state: string;
  since: number | null;
  updated: number | null;
  target: { type: "profile" | "room" | "run" | "providers"; id: string };
}
export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
const timestamp = (value: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
export function workspaceForFolder(
  nodes: HierarchyNode[],
  folder: string | undefined,
): string | null {
  if (!folder) return null;
  let node = nodes.find(
    (item) => item.id === projectAt(buildTree(nodes), folder),
  );
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    if (node.kind === "workspace") return node.id;
    seen.add(node.id);
    node = nodes.find((item) => item.id === node!.parent_id);
  }
  return null;
}
export function costForDay(day: UsageDay): {
  reported: number | null;
  estimated: number | null;
} {
  const reported = finite(day.actual_cost);
  return { reported, estimated: finite(day.estimated_cost) };
}
/** Hermes aggregates absent costs to zero and groups session lifetime cost by start date.
 * A zero aggregate is not evidence of free usage; preserve positive subtotals only. */
export function normalizeHermesUsage(value: UsageReport): UsageReport {
  return {
    daily: (Array.isArray(value.daily) ? value.daily : [])
      .filter((d) => typeof d.day === "string")
      .map((d) => ({
        ...d,
        actual_cost:
          (finite(d.actual_cost) ?? 0) > 0 ? d.actual_cost : undefined,
        estimated_cost:
          (finite(d.estimated_cost) ?? 0) > 0 ? d.estimated_cost : undefined,
      })),
  };
}
export function outcomeOf(run: WorkflowRunItem): string {
  if (run.status === "Done") return "Completed";
  const steps =
    run.step_states && typeof run.step_states === "object"
      ? Object.values(run.step_states)
      : [];
  if (run.status === "Blocked" && steps.includes("failed")) return "Failed";
  if (
    ["Blocked", "Deferred"].includes(run.status ?? "") &&
    steps.includes("cancelled")
  )
    return "Cancelled";
  return run.status === "Blocked"
    ? "Blocked"
    : run.status === "Deferred"
      ? "Deferred"
      : "Open";
}

/** A snapshot replaces cumulative usage. It is never an increment to a running total. */
export function buildActivityDashboard(
  sources: ActivitySources,
  filter: ActivityFilter,
  threads: Record<string, ProfileThread>,
  rooms: Record<string, GroupChatRoom>,
  prompts: Record<string, GroupPrompt>,
  now = Date.now(),
) {
  const attention: ActivityItem[] = [],
    progress: ActivityItem[] = [];
  const names = new Map(
    (sources.profiles.data ?? []).map((p) => [p.name, p.displayName || p.name]),
  );
  const profileMatch = (id: string) =>
    filter.agent === "all" || filter.agent === id;
  const workspaceMatch = (id: string | null) =>
    filter.workspace === "all" || id === filter.workspace;
  const scopedThreads = Object.values(threads).filter(
    (thread) =>
      profileMatch(thread.profile) &&
      workspaceMatch(
        workspaceForFolder(
          sources.hierarchy.data ?? [],
          sources.sessionFolders.data?.[
            `${thread.profile}:${thread.sessionId ?? thread.storedSessionId}`
          ],
        ),
      ),
  );
  for (const thread of scopedThreads) {
    const t = thread.transcript,
      owner = names.get(thread.profile) ?? thread.profile;
    const target = { type: "profile" as const, id: thread.profile };
    const title =
      t.messages
        .filter((m) => m.from === "you")
        .at(-1)
        ?.text.slice(0, 100) || "Conversation";
    const updated = t.messages.reduce<number | null>(
      (latest, m) => (m.at ? Math.max(latest ?? 0, m.at) : latest),
      t.lastTurn?.at ?? null,
    );
    for (const p of t.pending)
      attention.push({
        id: `${thread.profile}:${p.requestId}`,
        title:
          p.kind === "approval"
            ? p.description || p.command
            : p.questions[0]?.question || "Question",
        owner,
        state: p.kind === "approval" ? "Approval" : "Question",
        since: p.at,
        updated: p.at,
        target,
      });
    if (thread.error || t.lastTurn?.status === "error")
      attention.push({
        id: `error:${thread.profile}`,
        title: thread.error || title,
        owner,
        state: "Failed",
        since: t.lastTurn?.at ?? null,
        updated,
        target,
      });
    if (thread.opening || t.turnStartedAt !== null)
      progress.push({
        id: `session:${thread.profile}`,
        title,
        owner,
        state: t.pending.length ? "Waiting on you" : t.status || "Working",
        since: t.turnStartedAt,
        updated,
        target,
      });
  }
  // Rooms do not yet have a durable workspace relationship. Do not infer it from their members.
  if (filter.workspace === "all")
    for (const [id, room] of Object.entries(rooms)) {
      if (
        room.tombstone ||
        (filter.agent !== "all" && filter.agent !== `room:${id}`)
      )
        continue;
      const target = { type: "room" as const, id },
        owner = room.name || "Team";
      const updated = room.log.at(-1)?.at ?? null;
      for (const p of Object.values(prompts).filter((p) => p.group === id))
        attention.push({
          id: `room:${id}:${p.decision.requestId}`,
          title:
            p.decision.kind === "approval"
              ? p.decision.description || p.decision.command
              : p.decision.questions[0]?.question || "Question",
          owner,
          state: "Waiting on you",
          since: p.decision.at,
          updated,
          target,
        });
      if (room.running)
        progress.push({
          id: `room:${id}`,
          title:
            room.log
              .filter((m) => m.from.kind === "user")
              .at(-1)
              ?.text.slice(0, 100) || "Team conversation",
          owner,
          state: room.turn ? `${room.turn} is working` : "Working",
          since: null,
          updated,
          target,
        });
    }
  // Workflow records currently carry entity scope, not hierarchy workspace ownership.
  // Keep them global until a real relationship is present; never equate an entity with a workspace.
  const runs =
    filter.workspace === "all"
      ? [
          ...new Map((sources.runs.data ?? []).map((r) => [r.id, r])).values(),
        ].filter(
          (run) =>
            filter.agent === "all" ||
            run.actor === filter.agent ||
            run.actor === names.get(filter.agent),
        )
      : [];
  const start = Date.parse(
    new Date(now - (filter.days - 1) * 86_400_000).toISOString().slice(0, 10),
  );
  const periodRuns = runs.filter((r) => {
    const at = timestamp(r.completed_at) ?? timestamp(r.updated_at);
    return at !== null && at >= start && at <= now;
  });
  const outcomes = [
    "Completed",
    "Failed",
    "Cancelled",
    "Blocked",
    "Deferred",
    "Open",
  ].map((name) => ({
    name,
    count: periodRuns.filter((r) => outcomeOf(r) === name).length,
  }));
  for (const run of runs) {
    const target = { type: "run" as const, id: run.id },
      owner = run.actor || run.owner_role || "Unassigned";
    const item = {
      id: `run:${run.id}`,
      title: run.name,
      owner,
      state: run.status || "Unknown",
      since: timestamp(run.started_at),
      updated: timestamp(run.updated_at),
      target,
    };
    if (
      run.status === "Needs approval" ||
      (run.status === "Blocked" && periodRuns.includes(run))
    )
      attention.push({ ...item, since: timestamp(run.updated_at) });
    if (run.status === "In progress" || run.status === "Queued")
      progress.push(item);
  }
  const usageReports = Object.entries(sources.usage).filter(([id]) =>
    profileMatch(id),
  );
  const usageDays =
    filter.workspace !== "all"
      ? []
      : Array.from({ length: filter.days }, (_, i) => {
          const day = new Date(start + i * 86_400_000)
            .toISOString()
            .slice(0, 10);
          const rows = usageReports.flatMap(([, report]) => {
            const row = report.data?.daily?.find((d) => d.day === day);
            return row ? [row] : [];
          });
          const costs = rows.map(costForDay);
          const sum = (key: "reported" | "estimated") =>
            costs.some((c) => c[key] !== null)
              ? costs.reduce((total, c) => total + (c[key] ?? 0), 0)
              : null;
          return {
            date: new Date(day),
            day,
            reported: sum("reported"),
            estimated: sum("estimated"),
            reporting: costs.filter(
              (c) => c.reported !== null || c.estimated !== null,
            ).length,
          };
        });
  const total = (key: "reported" | "estimated") =>
    usageDays.some((d) => d[key] !== null)
      ? usageDays.reduce((sum, d) => sum + (d[key] ?? 0), 0)
      : null;
  const connections = (sources.connections.data ?? []).filter(
    (c) =>
      filter.agent === "all" ||
      c.id === filter.agent ||
      (c.id === "hermes" &&
        !filter.agent.startsWith("acp:") &&
        !filter.agent.startsWith("room:")),
  );
  if (filter.workspace === "all")
    for (const c of connections.filter((c) => c.state === "Unavailable"))
      attention.push({
        id: `connection:${c.id}`,
        title: c.name,
        owner: "Connection",
        state: "Unavailable",
        since: null,
        updated: sources.connections.at,
        target: { type: "providers", id: c.id },
      });
  return {
    attention: attention.sort((a, b) => (a.since ?? now) - (b.since ?? now)),
    progress,
    outcomes,
    periodRuns,
    usageDays,
    reported: total("reported"),
    estimated: total("estimated"),
    usageReporting: usageReports.filter(([, r]) =>
      r.data?.daily?.some(
        (d) =>
          Date.parse(d.day) >= start &&
          Date.parse(d.day) <= now &&
          (costForDay(d).reported !== null || costForDay(d).estimated !== null),
      ),
    ).length,
    usageExpected: usageReports.length,
    liveUsage: scopedThreads.filter((t) => t.sessionId || t.storedSessionId),
    connections,
    workspaceScoped: filter.workspace !== "all",
  };
}
export type ActivityDashboardModel = ReturnType<typeof buildActivityDashboard>;
