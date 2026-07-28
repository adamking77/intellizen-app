import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  Bot,
  Check,
  CircleAlert,
  ExternalLink,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  PANEL_SELECTED_ROLE_KEY,
  publishAgentPanelRoleMessage,
} from "@/lib/agent-panel-roles";
import {
  buildAgentCreationPreview,
  type AgentCreationDraft,
  type TeamRole,
} from "@/lib/team-roster";
import { cn } from "@/lib/utils";
import {
  applyCanonicalRoleReassignment,
  createReviewedTeamAgent,
  inspectTeam,
  previewRoleReassignment,
  toTeamReviewFixture,
  type RoleReassignmentDraft,
} from "@/services/team";
import {
  clearTeamReviewFixture,
  saveTeamReviewFixture,
} from "@/services/team-review-fixture";

const TABS = [
  { id: "role-map", label: "Role map", icon: UsersRound },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "assignments", label: "Assignments", icon: UserRoundCog },
  { id: "availability", label: "Availability", icon: Activity },
] as const;
type TeamTab = (typeof TABS)[number]["id"];

const EMPTY_AGENT: AgentCreationDraft = {
  name: "",
  key: "",
  purpose: "",
  mandate: "",
  boundaries: "No external human-visible action without founder approval.",
  ownerGate: "owner-only",
  bindingRef: null,
  roleRecordId: null,
  scope: "",
};

function roleSummary(role: TeamRole) {
  if (!role.agentName) return "Unstaffed";
  return `${role.agentName} · ${role.runtimeLabel} · ${role.executionLabel}`;
}

function RoleCard({
  role,
  selected,
  onClick,
}: {
  role: TeamRole;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative min-h-32 rounded-lg border bg-[var(--mantle)] p-4 text-left transition-colors",
        selected
          ? "border-[var(--accent-border)] shadow-[0_0_0_1px_var(--accent-border)]"
          : "border-[var(--border)] hover:border-[var(--overlay-1)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-ui text-sm font-semibold text-[var(--text)]">
            {role.roleName}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--subtext-0)]">
            {roleSummary(role)}
          </p>
        </div>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            role.ready ? "bg-[var(--success)]" : "bg-[var(--warning)]",
          )}
          title={role.ready ? "Ready" : "Unavailable"}
        />
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--subtext-0)]">
        {role.mandate}
      </p>
      {role.localReviewFixture ? (
        <span className="mt-3 inline-flex rounded-full border border-[var(--warning)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--warning)]">
          Local review overlay
        </span>
      ) : null}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const className =
    "mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent-border)]";
  return (
    <label className="block font-ui text-xs text-[var(--subtext-0)]">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className={className}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
    </label>
  );
}

export function TeamView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TeamTab>("role-map");
  const [selectedRoleKey, setSelectedRoleKey] = useState("operations_director");
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentStep, setAgentStep] = useState(1);
  const [agentDraft, setAgentDraft] = useState<AgentCreationDraft>(EMPTY_AGENT);
  const [creatingRecords, setCreatingRecords] = useState(false);
  const [assignmentDraft, setAssignmentDraft] =
    useState<RoleReassignmentDraft | null>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<Awaited<
    ReturnType<typeof previewRoleReassignment>
  > | null>(null);
  const [applyingAssignment, setApplyingAssignment] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: inspectTeam,
    staleTime: 15_000,
  });
  const team = teamQuery.data;
  const selectedRole =
    team?.roles.find((role) => role.roleKey === selectedRoleKey) ??
    team?.roles[0] ??
    null;
  const founder = team?.roles.find(
    (role) => role.roleKey === "founder_approval_authority",
  );
  const operatingRoles = useMemo(
    () =>
      (team?.roles ?? []).filter(
        (role) => role.roleKey !== "founder_approval_authority",
      ),
    [team?.roles],
  );

  async function refreshTeam() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["team"] }),
      queryClient.invalidateQueries({
        queryKey: ["agent-panel", "role-targets"],
      }),
      queryClient.invalidateQueries({ queryKey: ["agent-panel-role-targets"] }),
      queryClient.invalidateQueries({ queryKey: ["settings-runtime-catalog"] }),
    ]);
  }

  function talkToRole(roleKey: string) {
    try {
      window.localStorage.setItem(PANEL_SELECTED_ROLE_KEY, roleKey);
    } catch {
      /* mounted panel selection still receives the broadcast */
    }
    publishAgentPanelRoleMessage({ roleKey, open: true });
    toast.success(`Agent Panel switched to ${team?.roles.find((role) => role.roleKey === roleKey)?.roleName ?? roleKey}`);
  }

  function startAssignment(role: TeamRole) {
    setAssignmentDraft({
      roleRecordId: role.roleRecordId,
      agentRecordId: role.agentRecordId ?? team?.agents[0]?.recordId ?? "",
      bindingRef:
        role.bindingRef === "hermes-fiona"
          ? null
          : role.bindingRef ?? team?.bindings[0]?.bindingId ?? null,
      scope: role.assignmentScope ?? "",
    });
    setAssignmentPreview(null);
  }

  async function reviewAssignment() {
    if (!assignmentDraft) return;
    setAssignmentPreview(await previewRoleReassignment(assignmentDraft));
  }

  async function applyLocalFixture() {
    if (!assignmentDraft) return;
    saveTeamReviewFixture(toTeamReviewFixture(assignmentDraft));
    await refreshTeam();
    setAssignmentPreview(null);
    setAssignmentDraft(null);
    toast.success("Local review overlay applied; Supabase was not changed");
  }

  async function applyCanonicalAssignment() {
    if (!assignmentDraft) return;
    setApplyingAssignment(true);
    try {
      await applyCanonicalRoleReassignment(assignmentDraft);
      await refreshTeam();
      setAssignmentPreview(null);
      setAssignmentDraft(null);
      toast.success("Canonical role assignment updated");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setApplyingAssignment(false);
    }
  }

  async function createDraftRecords() {
    setCreatingRecords(true);
    try {
      await createReviewedTeamAgent(agentDraft);
      await refreshTeam();
      setCreatingAgent(false);
      setAgentStep(1);
      setAgentDraft(EMPTY_AGENT);
      toast.success("Draft agent records created for founder review");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCreatingRecords(false);
    }
  }

  function cancelAgentFlow() {
    setCreatingAgent(false);
    setAgentStep(1);
    setAgentDraft(EMPTY_AGENT);
  }

  const agentPreview = buildAgentCreationPreview(agentDraft);

  if (teamQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--subtext-0)]">
        Reading canonical roster…
      </div>
    );
  }
  if (teamQuery.error || !team) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-[var(--danger)]">{String(teamQuery.error)}</p>
          <Button className="mt-4" variant="outline" onClick={() => void teamQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (creatingAgent) {
    const steps = [
      "Identity",
      "Operating instructions",
      "Runtime",
      "Scope",
      "Assignment",
      "Review",
    ];
    return (
      <div className="flex h-full min-h-0">
        <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--mantle)] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
            Reviewed creation
          </p>
          <h1 className="mt-1 font-display text-xl text-[var(--text)]">New agent</h1>
          <ol className="mt-7 space-y-1">
            {steps.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => setAgentStep(index + 1)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded px-3 py-2 text-left font-ui text-xs",
                    agentStep === index + 1
                      ? "bg-[var(--surface-wash)] text-[var(--text)]"
                      : "text-[var(--subtext-0)]",
                  )}
                >
                  <span className="font-mono text-[10px]">{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-7">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-start justify-between border-b border-[var(--border)] pb-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
                  Step {agentStep} of 6
                </p>
                <h2 className="mt-1 font-display text-2xl text-[var(--text)]">
                  {steps[agentStep - 1]}
                </h2>
              </div>
              <Button variant="ghost" onClick={cancelAgentFlow}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
            <section className="py-6">
              {agentStep === 1 ? (
                <div className="grid gap-5">
                  <TextField label="Display name" value={agentDraft.name} onChange={(name) => setAgentDraft((draft) => ({ ...draft, name }))} placeholder="Agent name" />
                  <TextField label="Stable key" value={agentDraft.key} onChange={(key) => setAgentDraft((draft) => ({ ...draft, key }))} placeholder="lowercase_key" />
                  <TextField label="Purpose" value={agentDraft.purpose} onChange={(purpose) => setAgentDraft((draft) => ({ ...draft, purpose }))} placeholder="One bounded operating purpose" multiline />
                </div>
              ) : null}
              {agentStep === 2 ? (
                <div className="grid gap-5">
                  <TextField label="Mandate" value={agentDraft.mandate} onChange={(mandate) => setAgentDraft((draft) => ({ ...draft, mandate }))} multiline />
                  <TextField label="Boundaries" value={agentDraft.boundaries} onChange={(boundaries) => setAgentDraft((draft) => ({ ...draft, boundaries }))} multiline />
                  <label className="font-ui text-xs text-[var(--subtext-0)]">Owner gate<select value={agentDraft.ownerGate} onChange={(event) => setAgentDraft((draft) => ({ ...draft, ownerGate: event.target.value }))} className="mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm text-[var(--text)]"><option value="owner-only">Owner only</option><option value="allowlist">Allowlist</option><option value="operator-managed">Operator managed</option></select></label>
                </div>
              ) : null}
              {agentStep === 3 ? (
                <div>
                  <label className="font-ui text-xs text-[var(--subtext-0)]">Runtime policy<select value={agentDraft.bindingRef ?? ""} onChange={(event) => setAgentDraft((draft) => ({ ...draft, bindingRef: event.target.value || null }))} className="mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm text-[var(--text)]"><option value="">Inherit default at assignment</option>{team.bindings.map((binding) => <option key={binding.bindingId} value={binding.bindingId}>{binding.bindingId}</option>)}</select></label>
                  <p className="mt-4 rounded border border-[var(--border)] bg-[var(--mantle)] p-4 text-xs leading-5 text-[var(--subtext-0)]">Only the reviewed binding ID enters the record. Executable arguments, credentials, and provider profiles stay local.</p>
                </div>
              ) : null}
              {agentStep === 4 ? (
                <div className="grid gap-5">
                  <TextField label="Allowed work and assignment scope" value={agentDraft.scope} onChange={(scope) => setAgentDraft((draft) => ({ ...draft, scope }))} multiline />
                  <div className="rounded border border-[var(--border)] bg-[var(--mantle)] p-4"><p className="font-ui text-xs font-semibold text-[var(--text)]">Worker tool plane</p><p className="mt-1 text-xs leading-5 text-[var(--subtext-0)]">Sanitized environment · worker MCP only · directories constrained by the selected local binding.</p></div>
                </div>
              ) : null}
              {agentStep === 5 ? (
                <label className="font-ui text-xs text-[var(--subtext-0)]">Optional standing role<select value={agentDraft.roleRecordId ?? ""} onChange={(event) => setAgentDraft((draft) => ({ ...draft, roleRecordId: event.target.value || null }))} className="mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-sm text-[var(--text)]"><option value="">No standing role</option>{team.roles.map((role) => <option key={role.roleRecordId} value={role.roleRecordId}>{role.roleName}</option>)}</select></label>
              ) : null}
              {agentStep === 6 ? (
                <div>
                  <div className="rounded border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] p-4"><p className="font-ui text-xs font-semibold text-[var(--warning)]">Founder approval required</p><p className="mt-1 text-xs leading-5 text-[var(--subtext-0)]">Creating writes a draft Agent record and, if selected, a draft Role Assignment record. It does not activate either record.</p></div>
                  <pre className="mt-4 max-h-[440px] overflow-auto rounded bg-[var(--mantle)] p-4 font-mono text-[10px] leading-5 text-[var(--subtext-0)]">{JSON.stringify(agentPreview, null, 2)}</pre>
                </div>
              ) : null}
            </section>
            <footer className="flex justify-between border-t border-[var(--border)] pt-5">
              <Button variant="ghost" onClick={() => setAgentStep(Math.max(1, agentStep - 1))} disabled={agentStep === 1}>Back</Button>
              {agentStep < 6 ? <Button onClick={() => setAgentStep(agentStep + 1)}>Continue</Button> : <div className="flex gap-2"><Button variant="ghost" onClick={cancelAgentFlow}>Cancel without write</Button><Button onClick={() => void createDraftRecords()} disabled={creatingRecords || !agentDraft.name.trim() || !agentDraft.key.trim()}>{creatingRecords ? "Creating…" : "Create draft records"}</Button></div>}
            </footer>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--base)]">
      <header className="flex items-end justify-between gap-4 border-b border-[var(--border)] px-7 py-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
            Canonical roster · local runtime state
          </p>
          <h1 className="mt-1 font-display text-2xl text-[var(--text)]">Team</h1>
          <p className="mt-1 text-xs text-[var(--subtext-0)]">
            Roles hold authority. Agents occupy roles through reviewed assignments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refreshTeam()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button onClick={() => setCreatingAgent(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            New agent
          </Button>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-[var(--border)] px-7 py-2" aria-label="Team views">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("flex items-center gap-2 rounded px-3 py-2 font-ui text-xs", tab === item.id ? "bg-[var(--surface-wash)] text-[var(--text)]" : "text-[var(--subtext-0)] hover:text-[var(--text)]")}><Icon className="h-3.5 w-3.5" />{item.label}{item.id === "availability" && team.availability.length ? <span className="font-mono text-[10px] text-[var(--warning)]">{team.availability.length}</span> : null}</button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto p-7">
          {tab === "role-map" ? (
            <div className="mx-auto max-w-4xl">
              {founder ? <div className="mx-auto max-w-sm"><RoleCard role={founder} selected={selectedRole?.roleKey === founder.roleKey} onClick={() => setSelectedRoleKey(founder.roleKey)} /></div> : null}
              {founder ? <div className="mx-auto flex h-14 w-3 items-center justify-center"><div className="h-full w-px bg-[var(--border)]" /><ArrowDown className="absolute h-3.5 w-3.5 text-[var(--overlay-1)]" /></div> : null}
              <div className="grid gap-4 md:grid-cols-3">{operatingRoles.map((role) => <RoleCard key={role.roleKey} role={role} selected={selectedRole?.roleKey === role.roleKey} onClick={() => setSelectedRoleKey(role.roleKey)} />)}</div>
              <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--overlay-1)]">Edges represent standing reports-to and founder-gate relationships</p>
            </div>
          ) : null}

          {tab === "agents" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{team.agents.map((agent) => <section key={agent.recordId} className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-ui text-sm font-semibold text-[var(--text)]">{agent.name}</h2><p className="mt-1 font-mono text-[10px] text-[var(--accent)]">{agent.key}</p></div><span className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--subtext-0)]">{agent.status}</span></div><p className="mt-4 text-xs leading-5 text-[var(--subtext-0)]">{agent.identity}</p><p className="mt-4 font-mono text-[10px] text-[var(--overlay-1)]">{agent.roleNames.join(" · ") || "No standing role"}</p></section>)}</div>
          ) : null}

          {tab === "assignments" ? (
            <div>
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[var(--mantle)] font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--overlay-1)]"><tr><th className="px-4 py-3">Role</th><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Runtime</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3 text-right">Review</th></tr></thead>
                  <tbody>{team.roles.map((role) => <tr key={role.roleKey} className="border-t border-[var(--border)] bg-[var(--base)] text-xs"><td className="px-4 py-3 font-medium text-[var(--text)]">{role.roleName}{role.localReviewFixture ? <span className="ml-2 text-[9px] uppercase text-[var(--warning)]">local overlay</span> : null}</td><td className="px-4 py-3 text-[var(--subtext-0)]">{role.agentName ?? "Unstaffed"}</td><td className="px-4 py-3 font-mono text-[10px] text-[var(--subtext-0)]">{role.bindingRef ?? role.runtimeLabel}</td><td className="px-4 py-3 text-[var(--subtext-0)]">{role.assignmentScope ?? "—"}</td><td className="px-4 py-3 text-right"><Button variant="ghost" onClick={() => startAssignment(role)}>Reassign</Button></td></tr>)}</tbody>
                </table>
              </div>
              {team.fixture ? <div className="mt-4 flex items-center justify-between rounded border border-[var(--warning)] p-4"><div><p className="text-xs font-semibold text-[var(--warning)]">Verification-safe local roster overlay is active</p><p className="mt-1 text-xs text-[var(--subtext-0)]">Supabase records remain unchanged.</p></div><Button variant="ghost" onClick={() => { clearTeamReviewFixture(); void refreshTeam(); }}>Clear overlay</Button></div> : null}
            </div>
          ) : null}

          {tab === "availability" ? (
            <div className="space-y-3">{team.availability.length === 0 ? <div className="rounded-lg border border-[var(--border)] p-6 text-sm text-[var(--success)]"><Check className="mr-2 inline h-4 w-4" />No roster or runtime availability issues.</div> : team.availability.map((issue) => <section key={issue.id} className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] p-5"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" /><div><h2 className="font-ui text-sm font-semibold text-[var(--text)]">{issue.title}</h2><p className="mt-1 text-xs leading-5 text-[var(--subtext-0)]">{issue.detail}</p></div></div></section>)}</div>
          ) : null}
        </main>

        {tab === "role-map" && selectedRole ? (
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--mantle)] p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">Role inspector</p><h2 className="mt-1 font-display text-xl text-[var(--text)]">{selectedRole.roleName}</h2></div><ShieldCheck className={cn("h-5 w-5", selectedRole.ready ? "text-[var(--success)]" : "text-[var(--warning)]")} /></div>
            <p className="mt-4 text-xs leading-5 text-[var(--subtext-0)]">{selectedRole.mandate}</p>
            <dl className="mt-5 space-y-3 border-y border-[var(--border)] py-4 font-mono text-[10px]"><div><dt className="text-[var(--overlay-1)]">Occupant</dt><dd className="mt-1 text-[var(--subtext-0)]">{selectedRole.agentName ?? "Unstaffed"}</dd></div><div><dt className="text-[var(--overlay-1)]">Authority ceiling</dt><dd className="mt-1 text-[var(--subtext-0)]">{selectedRole.authority}</dd></div><div><dt className="text-[var(--overlay-1)]">Owner gate</dt><dd className="mt-1 text-[var(--subtext-0)]">{selectedRole.ownerGate}</dd></div><div><dt className="text-[var(--overlay-1)]">Assignment scope</dt><dd className="mt-1 text-[var(--subtext-0)]">{selectedRole.assignmentScope ?? "No standing assignment"}</dd></div><div><dt className="text-[var(--overlay-1)]">Runtime state</dt><dd className="mt-1 text-[var(--subtext-0)]">{roleSummary(selectedRole)} · {selectedRole.ready ? "ready" : "unavailable"}</dd></div></dl>
            <div className="mt-5"><p className="font-ui text-xs font-semibold text-[var(--text)]">Executable workflows targeting this role</p><div className="mt-2 space-y-1">{selectedRole.workflowNames.length ? selectedRole.workflowNames.map((name) => <p key={name} className="text-xs leading-5 text-[var(--subtext-0)]">{name}</p>) : <p className="text-xs text-[var(--overlay-1)]">None</p>}</div></div>
            <div className="mt-5"><p className="font-ui text-xs font-semibold text-[var(--text)]">Recent work</p>{selectedRole.recentWork.length ? <div className="mt-2 space-y-2">{selectedRole.recentWork.map((run) => <button key={run.id} type="button" onClick={() => navigate(`/workflows?run=${run.id}`)} className="block w-full rounded border border-[var(--border)] p-3 text-left"><span className="block text-xs text-[var(--text)]">{run.name}</span><span className="mt-1 block font-mono text-[9px] uppercase text-[var(--subtext-0)]">{run.status ?? "Unknown"}</span></button>)}</div> : <p className="mt-2 text-xs text-[var(--overlay-1)]">No recent canonical runs.</p>}</div>
            <div className="mt-6 grid gap-2"><Button onClick={() => talkToRole(selectedRole.roleKey)}><MessageSquare className="mr-2 h-3.5 w-3.5" />Talk to role</Button>{selectedRole.recentWork[0] ? <Button variant="outline" onClick={() => navigate(`/workflows?run=${selectedRole.recentWork[0].id}`)}><ExternalLink className="mr-2 h-3.5 w-3.5" />Open current work</Button> : null}<Button variant="ghost" onClick={() => { setTab("assignments"); startAssignment(selectedRole); }}>Review assignment</Button></div>
          </aside>
        ) : null}
      </div>

      {assignmentDraft ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <section className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--base)] p-6 shadow-2xl">
            <div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">Reviewed reassignment</p><h2 className="mt-1 font-display text-xl text-[var(--text)]">Role assignment</h2></div><Button variant="ghost" onClick={() => { setAssignmentDraft(null); setAssignmentPreview(null); }}><X className="h-4 w-4" /></Button></div>
            {!assignmentPreview ? <div className="mt-5 grid gap-4"><label className="font-ui text-xs text-[var(--subtext-0)]">Role<select value={assignmentDraft.roleRecordId} onChange={(event) => setAssignmentDraft((draft) => draft ? ({ ...draft, roleRecordId: event.target.value }) : draft)} className="mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--mantle)] px-3 py-2 text-sm text-[var(--text)]">{team.roles.map((role) => <option key={role.roleRecordId} value={role.roleRecordId}>{role.roleName}</option>)}</select></label><label className="font-ui text-xs text-[var(--subtext-0)]">Agent<select value={assignmentDraft.agentRecordId} onChange={(event) => setAssignmentDraft((draft) => draft ? ({ ...draft, agentRecordId: event.target.value }) : draft)} className="mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--mantle)] px-3 py-2 text-sm text-[var(--text)]">{team.agents.map((agent) => <option key={agent.recordId} value={agent.recordId}>{agent.name}</option>)}</select></label><label className="font-ui text-xs text-[var(--subtext-0)]">Runtime binding<select value={assignmentDraft.bindingRef ?? ""} onChange={(event) => setAssignmentDraft((draft) => draft ? ({ ...draft, bindingRef: event.target.value || null }) : draft)} className="mt-1.5 w-full rounded border border-[var(--border)] bg-[var(--mantle)] px-3 py-2 text-sm text-[var(--text)]"><option value="">No local binding / human / Hermes</option>{team.bindings.map((binding) => <option key={binding.bindingId} value={binding.bindingId}>{binding.bindingId}</option>)}</select></label><TextField label="Assignment scope" value={assignmentDraft.scope} onChange={(scope) => setAssignmentDraft((draft) => draft ? ({ ...draft, scope }) : draft)} multiline /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAssignmentDraft(null)}>Cancel</Button><Button onClick={() => void reviewAssignment()} disabled={!assignmentDraft.agentRecordId}>Review exact change</Button></div></div> : <div className="mt-5"><div className="rounded border border-[var(--warning)] p-4"><p className="text-xs font-semibold text-[var(--warning)]">Founder approval required for a canonical change</p><p className="mt-1 text-xs text-[var(--subtext-0)]">For acceptance testing, apply the local review overlay. It updates every composed Team/Panel read without writing Supabase.</p></div><pre className="mt-4 max-h-72 overflow-auto rounded bg-[var(--mantle)] p-4 font-mono text-[10px] leading-5 text-[var(--subtext-0)]">{JSON.stringify(assignmentPreview, null, 2)}</pre><div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setAssignmentPreview(null)}>Back</Button><Button variant="outline" onClick={() => void applyLocalFixture()}>Apply local review overlay</Button><Button onClick={() => void applyCanonicalAssignment()} disabled={applyingAssignment}>{applyingAssignment ? "Applying…" : "Apply canonical assignment"}</Button></div></div>}
          </section>
        </div>
      ) : null}
    </div>
  );
}
