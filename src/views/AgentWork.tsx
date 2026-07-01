import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { delegateAgentWork, listAgentProjects, listAgentWork } from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import type { AgentProjectItem, AgentWorkItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkStatusFilter = "open" | "needs_approval" | "blocked" | "done" | "all";

const STATUS_FILTERS: Array<{ id: WorkStatusFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "needs_approval", label: "Approvals" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

function formatElapsed(iso: string | null | undefined) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function textArray(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function statusVariant(status: string | null | undefined): "success" | "warning" | "destructive" | "info" | "secondary" {
  if (status === "Done") return "success";
  if (status === "Needs approval") return "warning";
  if (status === "Blocked") return "destructive";
  if (status === "In progress") return "info";
  return "secondary";
}

function statusIcon(status: string | null | undefined) {
  if (status === "Done") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "Needs approval") return <ShieldCheck className="h-3.5 w-3.5" />;
  if (status === "Blocked") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <CircleDashed className="h-3.5 w-3.5" />;
}

function filterStatuses(filter: WorkStatusFilter) {
  if (filter === "needs_approval") return ["Needs approval"];
  if (filter === "blocked") return ["Blocked"];
  if (filter === "done") return ["Done"];
  return undefined;
}

function normalizeSnippet(value: string | null | undefined) {
  return value?.replace(/\n{3,}/g, "\n\n").trim() || "No recorded detail yet.";
}

function splitList(value: string) {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function InfoCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
      <div className="mt-1 truncate font-ui text-[12px] text-[var(--text)]">{value || "None"}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-[var(--warning)]"
      : tone === "danger"
        ? "text-[var(--danger)]"
        : tone === "success"
          ? "text-[var(--success)]"
          : "text-[var(--text)]";
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className={cn("font-mono text-[20px] leading-none", toneClass)}>{value}</div>
      <div className="mt-1 font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
    </div>
  );
}

function WorkCard({
  item,
  selected,
  onSelect,
}: {
  item: AgentWorkItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const actors = textArray(item.assignee);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-md border px-3 py-3 text-left transition-colors",
        selected
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--mantle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 font-ui text-[13px] font-semibold leading-snug text-[var(--text)]">{item.title}</p>
          <p className="mt-1 truncate font-ui text-[11px] text-[var(--overlay-1)]">
            {item.initiative_name ?? "No initiative"} · {item.stage ?? "No stage"}
          </p>
        </div>
        <Badge variant={statusVariant(item.status)} className="shrink-0 gap-1">
          {statusIcon(item.status)}
          {item.status ?? "Unset"}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(actors.length ? actors : [item.current_actor ?? "Unassigned"]).map((actor) => (
          <Badge key={actor} variant="outline">{actor}</Badge>
        ))}
        {item.priority ? <Badge variant="neutral">{item.priority}</Badge> : null}
        {item.durable_role ? <Badge variant="info">{item.durable_role}</Badge> : null}
      </div>
    </button>
  );
}

function ProjectRow({ project }: { project: AgentProjectItem }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-ui text-[12px] font-semibold text-[var(--text)]">{project.title}</p>
        <Badge variant="outline">{project.task_ids.length}</Badge>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {project.agent_owner ? <Badge variant="info">{project.agent_owner}</Badge> : null}
        {project.priority ? <Badge variant="neutral">{project.priority}</Badge> : null}
        {project.stage ? <Badge variant="secondary">{project.stage}</Badge> : null}
      </div>
    </div>
  );
}

export function AgentWorkView() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<WorkStatusFilter>("open");
  const [actorFilter, setActorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [delegateRole, setDelegateRole] = useState("");
  const [delegateActor, setDelegateActor] = useState("");
  const [delegateReason, setDelegateReason] = useState("");
  const [delegateExpectedOutput, setDelegateExpectedOutput] = useState("");
  const [delegateAllowedTools, setDelegateAllowedTools] = useState("workspace.records, Workflow Registry, Workflow Runs, Agent Panel");
  const [delegateApprovalLimits, setDelegateApprovalLimits] = useState("No external send, publish, delete, schema, identity, or spend action without Adam approval.");
  const [delegateReturnPath, setDelegateReturnPath] = useState("Return a receipt on the parent work item with sources, actions taken, output, verification, and next step.");

  const includeDone = statusFilter === "all" || statusFilter === "done";
  const statuses = filterStatuses(statusFilter);

  const workQuery = useQuery({
    queryKey: ["agent-work", "screen", actorFilter, statusFilter],
    queryFn: () =>
      listAgentWork({
        actor: actorFilter || null,
        statuses,
        includeDone,
        limit: 100,
      }),
    refetchInterval: 60_000,
  });

  const projectsQuery = useQuery({
    queryKey: ["agent-projects", "screen", actorFilter],
    queryFn: () =>
      listAgentProjects({
        actor: actorFilter || null,
        includeDone: false,
        limit: 40,
      }),
    refetchInterval: 60_000,
  });

  const work = workQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const isLoading = workQuery.isLoading || projectsQuery.isLoading;
  const error = workQuery.error ?? projectsQuery.error;

  const actorOptions = useMemo(() => {
    const values = [
      ...work.flatMap((item) => textArray(item.assignee)),
      ...work.map((item) => item.current_actor),
      ...work.map((item) => item.initiative_agent_owner),
      ...projects.flatMap((project) => project.assignee),
      ...projects.map((project) => project.agent_owner),
    ];
    return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
  }, [projects, work]);

  const filteredWork = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return work;
    return work.filter((item) =>
      [
        item.title,
        item.initiative_name,
        item.current_actor,
        item.durable_role,
        item.functional_lane,
        item.body_preview,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, work]);

  useEffect(() => {
    if (filteredWork.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredWork.some((item) => item.id === selectedId)) {
      setSelectedId(filteredWork[0].id);
    }
  }, [filteredWork, selectedId]);

  const selected = filteredWork.find((item) => item.id === selectedId) ?? filteredWork[0] ?? null;
  const delegationMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select work before delegating.");
      return delegateAgentWork({
        parentWorkItemId: selected.id,
        requestedRole: delegateRole,
        requestedActor: delegateActor || null,
        reason: delegateReason,
        sourceContext: {
          records: [selected.id, selected.initiative_id].filter((value): value is string => Boolean(value)),
          documents: [],
          artifacts: [],
        },
        expectedOutput: delegateExpectedOutput,
        allowedTools: splitList(delegateAllowedTools),
        approvalLimits: splitList(delegateApprovalLimits),
        returnPath: delegateReturnPath,
        receiptRequired: true,
        confirmWrite: true,
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-work"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-databases"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database"] }),
      ]);
      toast.success("Delegated work item created", {
        description: result.child_work_item_id ?? result.delegation_id,
      });
      setDelegateReason("");
      setDelegateExpectedOutput("");
    },
    onError: (error) => toastError("Delegation failed", error),
  });
  const metrics = useMemo(() => ({
    open: work.filter((item) => item.status !== "Done").length,
    approvals: work.filter((item) => item.status === "Needs approval" || Boolean(item.approval_needed)).length,
    blocked: work.filter((item) => item.status === "Blocked").length,
    activeProjects: projects.length,
  }), [projects.length, work]);

  useEffect(() => {
    if (!selected) return;
    setDelegateRole(selected.durable_role ?? selected.functional_lane ?? "");
    setDelegateActor("");
    setDelegateReason("");
    setDelegateExpectedOutput("");
    setDelegateReturnPath("Return a receipt on the parent work item with sources, actions taken, output, verification, and next step.");
  }, [selected?.id]);

  function submitDelegation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (delegationMutation.isPending) return;
    delegationMutation.mutate();
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Agent Work unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {error instanceof Error ? error.message : "Agent work could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div>
          <span className="text-label">Agent Work</span>
          <p className="mt-1 font-ui text-[12px] text-[var(--overlay-1)]">
            workspace.records · live routing and receipts
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            void workQuery.refetch();
            void projectsQuery.refetch();
          }}
          disabled={workQuery.isFetching || projectsQuery.isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", (workQuery.isFetching || projectsQuery.isFetching) && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4 lg:grid-cols-4">
        <Metric label="Open work" value={metrics.open} />
        <Metric label="Approvals" value={metrics.approvals} tone="warning" />
        <Metric label="Blocked" value={metrics.blocked} tone="danger" />
        <Metric label="Active projects" value={metrics.activeProjects} tone="success" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex h-[46%] w-full shrink-0 flex-col border-b border-[var(--border)] bg-[var(--base)] lg:h-auto lg:w-[390px] lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-[var(--border)] p-4">
            <div className="grid grid-cols-3 gap-1 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-1 lg:flex">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatusFilter(filter.id)}
                  className={cn(
                    "h-7 min-w-0 rounded px-2 font-ui text-[11px] font-medium transition-colors lg:flex-1",
                    statusFilter === filter.id
                      ? "bg-[var(--base)] text-[var(--text)]"
                      : "text-[var(--overlay-1)] hover:text-[var(--subtext-0)]",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5">
              <Search className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search work"
                className="min-w-0 flex-1 bg-transparent font-ui text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
              />
            </label>

            <select
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
              aria-label="Agent actor filter"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-ui text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
            >
              <option value="">All actors</option>
              {actorOptions.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading work...
              </div>
            ) : filteredWork.length > 0 ? (
              <div className="space-y-2">
                {filteredWork.map((item) => (
                  <WorkCard
                    key={item.id}
                    item={item}
                    selected={item.id === selected?.id}
                    onSelect={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-8 text-center font-ui text-[12px] text-[var(--overlay-1)]">
                No work matches this view.
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {selected ? (
            <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
              <section className="border-b border-[var(--border)] pb-5">
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(selected.status)} className="gap-1">
                        {statusIcon(selected.status)}
                        {selected.status ?? "Unset"}
                      </Badge>
                      {selected.priority ? <Badge variant="neutral">{selected.priority}</Badge> : null}
                      <Badge variant="outline">
                        <Clock3 className="mr-1 h-3 w-3" />
                        {formatElapsed(selected.updated_at)}
                      </Badge>
                    </div>
                    <h1 className="font-ui text-[24px] font-semibold leading-tight text-[var(--text)]">{selected.title}</h1>
                    <p className="mt-2 font-ui text-[13px] text-[var(--overlay-1)]">
                      {selected.initiative_name ?? "No linked initiative"} · {selected.stage ?? "No stage"}
                    </p>
                  </div>
                  <Link
                    to={`/databases/${selected.database_id}`}
                    className={cn(buttonVariants({ size: "sm", variant: "accent-outline" }), "shrink-0")}
                  >
                    Open record
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCell label="Current actor" value={selected.current_actor} />
                <InfoCell label="Durable role" value={selected.durable_role} />
                <InfoCell label="Functional lane" value={selected.functional_lane} />
                <InfoCell label="Backup actor" value={selected.backup_actor} />
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approval / Next Step
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoCell label="Approval needed" value={selected.approval_needed} />
                      <InfoCell label="Next step" value={selected.next_step} />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <UserRound className="h-3.5 w-3.5" />
                      Latest Note
                    </div>
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.latest_note)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Latest Receipt
                    </div>
                    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.latest_receipt)}
                    </pre>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <Bot className="h-3.5 w-3.5" />
                      Source Context
                    </div>
                    <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                      <InfoCell label="Source" value={selected.source} />
                      <InfoCell label="Initiative owner" value={selected.initiative_agent_owner} />
                      <InfoCell label="Area" value={typeof selected.area === "string" ? selected.area : null} />
                      <p className="whitespace-pre-wrap font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                        {selected.body_preview || "No body preview."}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={submitDelegation} className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Delegate</div>
                        <p className="mt-1 font-ui text-[11px] text-[var(--overlay-1)]">Creates a child task with this work as source context.</p>
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        variant="accent-soft"
                        disabled={
                          delegationMutation.isPending ||
                          !delegateRole.trim() ||
                          !delegateReason.trim() ||
                          !delegateExpectedOutput.trim() ||
                          !delegateReturnPath.trim()
                        }
                        className="shrink-0 gap-1.5"
                      >
                        {delegationMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Delegate
                      </Button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Requested role</span>
                        <input
                          value={delegateRole}
                          onChange={(event) => setDelegateRole(event.target.value)}
                          className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Requested actor</span>
                        <input
                          value={delegateActor}
                          onChange={(event) => setDelegateActor(event.target.value)}
                          placeholder="Optional"
                          className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)] focus:border-[var(--accent-border)]"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block space-y-1">
                      <span className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Reason</span>
                      <textarea
                        value={delegateReason}
                        onChange={(event) => setDelegateReason(event.target.value)}
                        rows={2}
                        className="min-h-[56px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--base)] px-2 py-1.5 font-ui text-[12px] leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                      />
                    </label>
                    <label className="mt-2 block space-y-1">
                      <span className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Expected output</span>
                      <textarea
                        value={delegateExpectedOutput}
                        onChange={(event) => setDelegateExpectedOutput(event.target.value)}
                        rows={2}
                        className="min-h-[56px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--base)] px-2 py-1.5 font-ui text-[12px] leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                      />
                    </label>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Allowed tools</span>
                        <textarea
                          value={delegateAllowedTools}
                          onChange={(event) => setDelegateAllowedTools(event.target.value)}
                          rows={2}
                          className="min-h-[56px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--base)] px-2 py-1.5 font-ui text-[12px] leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Approval limits</span>
                        <textarea
                          value={delegateApprovalLimits}
                          onChange={(event) => setDelegateApprovalLimits(event.target.value)}
                          rows={2}
                          className="min-h-[56px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--base)] px-2 py-1.5 font-ui text-[12px] leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block space-y-1">
                      <span className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Return path</span>
                      <textarea
                        value={delegateReturnPath}
                        onChange={(event) => setDelegateReturnPath(event.target.value)}
                        rows={2}
                        className="min-h-[56px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--base)] px-2 py-1.5 font-ui text-[12px] leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                      />
                    </label>
                  </form>

                  <div>
                    <div className="mb-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Active Projects</div>
                    <div className="space-y-2">
                      {projects.slice(0, 8).map((project) => (
                        <ProjectRow key={project.id} project={project} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-[var(--border)] font-ui text-[13px] text-[var(--overlay-1)]">
              Select work to inspect routing, context, and receipts.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
