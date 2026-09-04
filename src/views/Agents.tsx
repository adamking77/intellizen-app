// The Agents page: every agent (Hermes profiles and ACP entries) and every
// team, after hermes-app's `pages/Agents.tsx`. One grid grammar for both.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { Card, NewCard, Tag } from "@/components/agents/agent-card";
import { AgentEditor } from "@/components/agents/agent-editor";
import { blankAgent, engineLabel, isHermes, profileOf, teamMembers, type Agent, type Team } from "@/components/agents/agent-model";
import { deleteAgent, describeHermesAgent, listAgents, loadAvatar, saveAgent, setAvatar } from "@/components/agents/agents-data";
import { Avatar, TeamStack } from "@/components/agents/avatar";
import { TeamSheet } from "@/components/agents/team-sheet";
import { deleteTeam, loadTeams, newTeamId, saveTeam } from "@/components/agents/teams-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useEngineStore } from "@/engine/engine-store";
import { discoverAcpProviders } from "@/engine/acp-registry";
import { getGatewayClient } from "@/engine/gateway";
import { useSessionStore } from "@/engine/session-store";
import { requestAgentPanelOpen } from "@/lib/agent-panel-persistence";
import { DEFAULT_AGENT_CONTEXT_KEY, useStringListPreference } from "@/lib/settings-preferences";
import { errorMessage, toast } from "@/lib/toast";
import { groupMemberKey } from "@/rooms/group-membership";
import { hasGroupChatNameBase } from "@/rooms/group-chat";
import { createRoom, ensureRoomsLoaded, listRooms } from "@/rooms/rooms";
import type { GroupMember } from "@/rooms/types";

const TITLE = "font-ui text-[var(--t-title)] font-light uppercase tracking-[0.16em] text-[var(--text)]";
const GRID = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(248px,1fr))]";
const ACTION =
  "rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3.5 py-1.5 font-ui text-[var(--t-meta)] text-[var(--text)] hover:bg-[var(--hover)] disabled:opacity-50";

/** Point the real panel at this profile, reveal it, and focus its composer. */
function talkTo(target: string) {
  useSessionStore.getState().selectProfile(target);
  requestAgentPanelOpen();
}

export function AgentsView() {
  const [defaultContext] = useStringListPreference(DEFAULT_AGENT_CONTEXT_KEY);
  const client = getGatewayClient();
  const queryClient = useQueryClient();
  const engineOpen = useEngineStore((s) => s.connection === "open");
  const engineError = useEngineStore((s) => s.error);

  const list = useQuery({
    queryKey: ["agents", "list", engineOpen],
    queryFn: () => listAgents(client, engineOpen),
    staleTime: 15_000,
  });
  const teams = useQuery({ queryKey: ["agents", "teams"], queryFn: loadTeams, staleTime: Infinity });
  const discoveredProviders = useQuery({
    queryKey: ["settings", "acp-providers"],
    queryFn: discoverAcpProviders,
    staleTime: 15_000,
  });
  const agents = list.data?.agents ?? [];
  const providerOptions = [
    { id: "hermes" as const, label: "Hermes", available: engineOpen },
    ...(discoveredProviders.data ?? []).map((provider) => ({
      id: provider.engine,
      label: provider.label,
      available: provider.available,
    })),
  ];

  // Pictures, fetched once per profile that has one.
  const [images, setImages] = useState<Record<string, string | null>>({});
  useEffect(() => {
    for (const a of agents) {
      if (!a.hasAvatar || a.id in images) continue;
      setImages((m) => ({ ...m, [a.id]: null }));
      void loadAvatar(client, a).then((url) => setImages((m) => ({ ...m, [a.id]: url }))).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agents", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["acp", "agents"] }),
      queryClient.invalidateQueries({ queryKey: ["rooms", "seatable-members"] }),
    ]);

  // ── Editor ──
  const [editing, setEditing] = useState<{ agent: Agent; creating: boolean } | null>(null);
  const detail = useQuery({
    queryKey: ["agents", "describe", editing?.agent.id],
    queryFn: () => describeHermesAgent(client, editing!.agent),
    enabled: !!editing && !editing.creating && isHermes(editing.agent),
    staleTime: 0,
  });
  const opened = editing ? { ...editing.agent, ...(detail.data ?? {}) } : null;

  const save = useMutation({
    mutationFn: ({ draft, confirmModel }: { draft: Agent; confirmModel: boolean }) =>
      saveAgent(client, draft, {
        creating: editing?.creating ?? false,
        confirmModel,
        previousAcp: list.data?.acpEntries.find((e) => `acp:${e.id}` === draft.id),
      }),
    onSuccess: (saved) => {
      toast.success(`${saved.displayName} saved`);
      void refresh();
    },
  });

  const [confirming, setConfirming] = useState<{ kind: "agent"; agent: Agent } | { kind: "team"; team: Team } | null>(null);
  const remove = useMutation({
    mutationFn: async (agent: Agent) => deleteAgent(agent),
    onSuccess: (_, agent) => {
      toast.success(`${agent.displayName} deleted`);
      if (useSessionStore.getState().selectedProfile === (isHermes(agent) ? profileOf(agent.id) : agent.id)) {
        useSessionStore.getState().selectProfile(null);
      }
      setEditing(null);
      void refresh();
    },
    onError: (e) => toast.error("Could not delete", { description: errorMessage(e) }),
  });

  // ── Teams ──
  const [teamSheet, setTeamSheet] = useState<Team | true | null>(null);
  const writeTeams = useCallback(
    async (fn: () => Promise<Team[]>) => {
      const next = await fn();
      queryClient.setQueryData(["agents", "teams"], next);
    },
    [queryClient],
  );

  const openTeamRoom = async (team: Team) => {
    await ensureRoomsLoaded();
    const members: GroupMember[] = teamMembers(team, agents).map((agent) => ({
      name: isHermes(agent) ? profileOf(agent.id)! : agent.id.slice(4),
      door: isHermes(agent) ? "gateway" : "acp",
      display_name: agent.displayName,
      title: agent.role,
      model: agent.model || null,
      provider: agent.provider || engineLabel(agent.engine),
      avatar_style: agent.avatarStyle,
      avatar_kind: agent.avatarKind,
      avatar_color: agent.avatarColor,
    }));
    const keys = members.map(groupMemberKey).sort().join("|");
    const existing = listRooms().find(
      (room) => hasGroupChatNameBase(room.name, team.name) && (room.members ?? []).map(groupMemberKey).sort().join("|") === keys,
    );
    useSessionStore.getState().selectRoom(existing?.roomId ?? await createRoom(team.name, members));
    requestAgentPanelOpen();
  };

  const offline = !engineOpen;
  const acpTrouble = list.data?.acpTrouble ?? null;
  const newAgentEngine = engineOpen
    ? "hermes"
    : (discoveredProviders.data ?? []).find((provider) => provider.available)?.engine ?? "hermes";

  return (
    <div className="relative h-full overflow-y-auto bg-[var(--base)] px-3 py-4 sm:px-6 sm:py-5">
      {offline ? (
        <Notice tone="bad">Hermes is offline{engineError ? ` — ${engineError}` : ""}. Hermes profiles are unavailable; ACP agents and teams remain editable.</Notice>
      ) : list.error ? (
        <Notice tone="bad">Your agents could not be read — {errorMessage(list.error)}. Nothing below is missing; the app cannot see it.</Notice>
      ) : acpTrouble ? (
        <Notice tone="wait">The ACP registry could not be read — {acpTrouble}. Hermes profiles are listed; command-line agents are not.</Notice>
      ) : null}

      {list.isSuccess && agents.length === 0 ? (
        <p className="max-w-[520px] pb-4 font-ui text-[var(--t-meta)] leading-[1.5] text-[var(--text-muted)]">
          No agents yet. Make one below — a Hermes profile or any installed ACP command-line agent.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3.5 pb-4">
        <h1 className={TITLE}>Agents</h1>
        {list.isSuccess ? <Tag>{agents.length} configured</Tag> : null}
        <div className="grow" />
        <button type="button" className={ACTION} onClick={() => setEditing({ agent: blankAgent(newAgentEngine), creating: true })}>
          New agent
        </button>
      </div>

      {list.isPending ? (
        <div className={GRID} aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[150px] rounded-[var(--r-plane)] bg-[var(--mantle)] opacity-60" />
          ))}
        </div>
      ) : (
        <div className={GRID}>
          {agents.map((a) => (
            <Card
              key={a.id}
              label={a.displayName}
              onOpen={() => setEditing({ agent: a, creating: false })}
              items={[
                { label: "Open in chat", onSelect: () => talkTo(isHermes(a) ? profileOf(a.id)! : a.id) },
                { label: "Edit agent…", onSelect: () => setEditing({ agent: a, creating: false }) },
                { label: "Delete", variant: "danger" as const, onSelect: () => setConfirming({ kind: "agent", agent: a }) },
              ]}
            >
              <Avatar agent={a} size={48} image={images[a.id]} />
              <div className="flex flex-col gap-[3px]">
                <span className="font-ui text-[var(--t-body)] text-[var(--text)]">{a.displayName}</span>
                <span className="line-clamp-2 font-ui text-[var(--t-meta)] leading-[1.4] text-[var(--text-muted)]" title={a.role}>
                  {a.role}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-[7px]">
                <Tag>{engineLabel(a.engine)}</Tag>
                <span className="font-mono text-[var(--t-section)] text-[var(--text-muted)]">{a.model}</span>
                {a.isDefault ? <span className="font-mono text-[var(--t-count)] text-[var(--text-muted)]">default</span> : null}
              </div>
            </Card>
          ))}
          <NewCard label="New agent" onClick={() => setEditing({ agent: blankAgent(newAgentEngine), creating: true })} />
        </div>
      )}

      {/* Teams: below the agents, because a team is made of them. */}
      <div className="flex flex-wrap items-center gap-3.5 pb-4 pt-[30px]">
        <h1 className={TITLE}>Teams</h1>
        {(teams.data?.length ?? 0) > 0 ? <Tag>{teams.data!.length}</Tag> : null}
        <div className="grow" />
        <button type="button" className={ACTION} disabled={agents.length < 2} onClick={() => setTeamSheet(true)}>
          New team
        </button>
      </div>
      {teams.error ? (
        <Notice tone="bad">Teams could not be read — {errorMessage(teams.error)}.</Notice>
      ) : agents.length < 2 ? (
        <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">A team is two or more agents answering in turn. Make a second agent first.</span>
      ) : (
        <div className={GRID}>
          {(teams.data ?? []).map((t) => {
            const members = teamMembers(t, agents);
            return (
              <Card
                key={t.id}
                label={t.name}
                onOpen={() => setTeamSheet(t)}
                items={[
                  { label: "Open in chat", onSelect: () => void openTeamRoom(t).catch((error) => toast.error("Could not open room", { description: errorMessage(error) })) },
                  { label: "Edit team…", onSelect: () => setTeamSheet(t) },
                  { label: "Delete", variant: "danger" as const, onSelect: () => setConfirming({ kind: "team", team: t }) },
                ]}
              >
                <TeamStack agents={members} size={34} images={images} />
                <div className="flex flex-col gap-[3px]">
                  <span className="font-ui text-[var(--t-body)] text-[var(--text)]">{t.name}</span>
                  <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">{members.map((m) => m.displayName).join(", ")}</span>
                </div>
                <div className="flex flex-wrap items-center gap-[7px]">
                  <Tag>{members.length} agents</Tag>
                  <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
                    {t.projects.length === 0 ? "no project yet" : t.projects.length === 1 ? "1 project" : `${t.projects.length} projects`}
                  </span>
                </div>
              </Card>
            );
          })}
          <NewCard label="New team" onClick={() => setTeamSheet(true)} />
        </div>
      )}

      {opened ? (
        <AgentEditor
          key={opened.id || "new"}
          agent={opened}
          creating={editing!.creating}
          loadingDetail={detail.isFetching}
          detailError={detail.error ? errorMessage(detail.error) : null}
          image={images[opened.id] ?? null}
          defaultContext={defaultContext}
          providers={providerOptions}
          onSave={(draft, confirmModel) => save.mutateAsync({ draft, confirmModel }).then(() => undefined)}
          onDelete={(a) => setConfirming({ kind: "agent", agent: a })}
          onPickImage={async (url) => {
            await setAvatar(client, opened, url);
            setImages((m) => ({ ...m, [opened.id]: url }));
            void refresh();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {teamSheet ? (
        <TeamSheet
          agents={agents}
          team={teamSheet === true ? undefined : teamSheet}
          images={images}
          onClose={() => setTeamSheet(null)}
          onSave={async (name, members) => {
            const prev = teamSheet === true ? null : teamSheet;
            await writeTeams(() => saveTeam({ id: prev?.id ?? newTeamId(), name, members, projects: prev?.projects ?? [] }));
            setTeamSheet(null);
          }}
          onDelete={
            teamSheet === true
              ? undefined
              : async () => {
                  await writeTeams(() => deleteTeam(teamSheet.id));
                  setTeamSheet(null);
                }
          }
        />
      ) : null}

      <ConfirmDialog
        open={!!confirming}
        danger
        confirmLabel="Delete"
        title={confirming ? `Delete ${confirming.kind === "agent" ? confirming.agent.displayName : confirming.team.name}?` : ""}
        message={
          confirming?.kind === "agent"
            ? isHermes(confirming.agent)
              ? "The profile's sessions, SOUL.md and skills go with it. Teams that name it get smaller."
              : "Its registry entry goes. Teams that name it get smaller."
            : confirming?.kind === "team"
              ? `The team configuration goes. Its ${confirming.team.members.length} agents and existing room history stay.`
              : ""
        }
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const c = confirming;
          setConfirming(null);
          if (!c) return;
          if (c.kind === "agent") remove.mutate(c.agent);
          else void writeTeams(() => deleteTeam(c.team.id)).catch((e) => toast.error("Could not delete team", { description: errorMessage(e) }));
        }}
      />
    </div>
  );
}

function Notice({ tone, children }: { tone: "bad" | "wait"; children: React.ReactNode }) {
  return (
    <div
      className="mb-4 rounded-[var(--r-ctl)] border px-3 py-2 font-ui text-[var(--t-meta)] leading-[1.5]"
      style={{ borderColor: `var(--${tone})`, color: `var(--${tone})`, background: `color-mix(in srgb, var(--${tone}) 11%, transparent)` }}
    >
      {children}
    </div>
  );
}
