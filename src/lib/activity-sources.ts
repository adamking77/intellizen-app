import type { HermesProfile } from "@/engine/profiles";
import {
  listAcpAgents,
  listAcpProviderStatuses,
  discoverAcpProviders,
} from "@/engine/acp-registry";
import { useEngineStore } from "@/engine/engine-store";
import { hermesRest } from "@/engine/rest";
import { useSessionStore } from "@/engine/session-store";
import { fetchHermesProfiles } from "@/services/agent";
import { listHermesSidebarSessions } from "@/services/hermes-project-sessions";
import { listWorkflowRuns } from "./data";
import { listHierarchy } from "./hierarchy";
import {
  normalizeHermesUsage,
  type ActivityConnection,
  type ActivitySources,
  type SourceRead,
  type UsageReport,
} from "./activity-dashboard";

/** Last good data stays visible, with its original timestamp and a stale marker. */
export async function activitySource<T>(
  read: () => Promise<T>,
  previous?: SourceRead<T>,
  now = Date.now(),
): Promise<SourceRead<T>> {
  try {
    return { data: await read(), at: now };
  } catch (error) {
    return {
      data: previous?.data ?? null,
      at: previous?.at ?? null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
/** A failed provider cannot erase another provider's successful read. */
export function mergeActivitySources<T>(
  parts: SourceRead<T[]>[],
): SourceRead<T[]> {
  const times = parts.flatMap((p) => (p.at === null ? [] : [p.at]));
  return {
    data: parts.some((p) => p.data !== null)
      ? parts.flatMap((p) => p.data ?? [])
      : null,
    at: times.length ? Math.min(...times) : null,
    error: parts.some((p) => p.error)
      ? parts.flatMap((p) => (p.error ? [p.error] : [])).join("; ")
      : undefined,
  };
}
function previousPart<T>(
  source: SourceRead<T[]> | undefined,
  match: (item: T) => boolean,
): SourceRead<T[]> | undefined {
  return source
    ? { ...source, data: source.data?.filter(match) ?? null }
    : undefined;
}

export async function collectActivitySources(
  days: 7 | 30,
  previous?: ActivitySources,
): Promise<ActivitySources> {
  const at = Date.now();
  const acpAgents = listAcpAgents();
  const [
    runs,
    hierarchy,
    hermesProfiles,
    acpProfiles,
    acpConnections,
    hermesFolders,
    acpFolders,
  ] = await Promise.all([
    activitySource(
      () => listWorkflowRuns({ includeCompleted: true, limit: 1000 }),
      previous?.runs,
      at,
    ),
    activitySource(listHierarchy, previous?.hierarchy, at),
    activitySource(
      fetchHermesProfiles,
      previousPart(previous?.profiles, (p) => !p.name.startsWith("acp:")),
      at,
    ),
    activitySource(
      async () =>
        (await acpAgents).map(
          (a): HermesProfile => ({
            name: `acp:${a.id}`,
            displayName: a.name,
            model: a.model ?? null,
            provider: a.engine,
            description: a.role ?? "",
            isDefault: false,
            gatewayRunning: true,
          }),
        ),
      previousPart(previous?.profiles, (p) => p.name.startsWith("acp:")),
      at,
    ),
    activitySource(
      async () => {
        const [providers, statuses, agents] = await Promise.all([
          discoverAcpProviders(),
          listAcpProviderStatuses(),
          acpAgents,
        ]);
        return agents.map((agent): ActivityConnection => {
          const provider = providers.find((p) => p.engine === agent.engine);
          const connected = statuses.some((s) => s.agentId === agent.id);
          return {
            id: `acp:${agent.id}`,
            name: agent.name,
            state: connected
              ? "Connected"
              : provider?.available
                ? "Available"
                : "Unavailable",
            detail: connected
              ? `${agent.engine} · active bridge`
              : provider?.available
                ? `${agent.engine} · starts when needed`
                : `${agent.engine} · check provider setup`,
          };
        });
      },
      previousPart(previous?.connections, (c) => c.id !== "hermes"),
      at,
    ),
    activitySource(
      async () =>
        (await listHermesSidebarSessions())
          .filter((s) => s.cwd)
          .map((s): [string, string] => [`${s.profile}:${s.id}`, s.cwd!]),
      previous?.sessionFolders
        ? {
            ...previous.sessionFolders,
            data: Object.entries(previous.sessionFolders.data ?? {}).filter(
              ([key]) => !key.startsWith("acp:"),
            ),
          }
        : undefined,
      at,
    ),
    activitySource(
      async () => {
        const agents = await acpAgents;
        return Object.values(useSessionStore.getState().threads).flatMap(
          (thread): [string, string][] => {
            const agent = agents.find((a) => `acp:${a.id}` === thread.profile);
            return agent?.cwd && thread.sessionId
              ? [[`${thread.profile}:${thread.sessionId}`, agent.cwd]]
              : [];
          },
        );
      },
      previous?.sessionFolders
        ? {
            ...previous.sessionFolders,
            data: Object.entries(previous.sessionFolders.data ?? {}).filter(
              ([key]) => key.startsWith("acp:"),
            ),
          }
        : undefined,
      at,
    ),
  ]);
  const profiles = mergeActivitySources([hermesProfiles, acpProfiles]);
  const folders = mergeActivitySources([hermesFolders, acpFolders]);
  const hermes = useEngineStore.getState();
  const connections = mergeActivitySources<ActivityConnection>([
    {
      data: [
        {
          id: "hermes",
          name: "Hermes",
          state: hermes.connection === "open" ? "Connected" : "Unavailable",
          detail:
            hermes.connection === "open"
              ? "Gateway connected"
              : "Open Providers to reconnect",
        },
      ],
      at,
    },
    acpConnections,
  ]);
  const usage = Object.fromEntries(
    await Promise.all(
      (profiles.data ?? [])
        .filter((p) => !p.name.startsWith("acp:"))
        .map(async (p) => [
          p.name,
          await activitySource(
            async () =>
              normalizeHermesUsage(
                await hermesRest<UsageReport>(
                  `/api/analytics/usage?days=${days}&profile=${encodeURIComponent(p.name)}`,
                ),
              ),
            previous?.usage[p.name],
            at,
          ),
        ]),
    ),
  );
  return {
    at,
    runs,
    hierarchy,
    profiles,
    connections,
    sessionFolders: {
      ...folders,
      data: folders.data ? Object.fromEntries(folders.data) : null,
    },
    usage,
  };
}
