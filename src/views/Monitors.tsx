import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { IndicatorStrip, type IndicatorItem } from "@/components/ui/indicator-strip";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { domainColor } from "@/lib/domains";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  runMonitorNow,
  seedDefaultMonitors,
  updateMonitor,
} from "@/lib/data";
import type { Monitor, MonitorFrequency } from "@/lib/types";
import { WATCH_DOMAINS } from "@/lib/watch-domains";

type StatusFilter = "all" | "active" | "paused";

function formatElapsed(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function MonitorsView() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: monitors, isLoading, error } = useQuery({
    queryKey: ["monitors"],
    queryFn: listMonitors,
  });

  const seedMutation = useMutation({
    mutationFn: seedDefaultMonitors,
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success(count > 0 ? `Seeded ${count} default monitors` : "Defaults already present");
    },
    onError: (err) => toastError("Seed failed", err),
  });

  const stats = useMemo(() => {
    const list = monitors ?? [];
    const active = list.filter((m) => m.status === "active").length;
    const paused = list.filter((m) => m.status === "paused").length;
    const lastRun = list
      .map((m) => m.last_run)
      .filter(Boolean)
      .sort()
      .pop();
    const totalSignals = list.reduce((sum, m) => sum + (m.signal_count ?? 0), 0);
    return { active, paused, lastRun, totalSignals, total: list.length };
  }, [monitors]);

  const counts = useMemo(
    () => ({
      all: (monitors ?? []).length,
      active: stats.active,
      paused: stats.paused,
    }),
    [monitors, stats],
  );

  const filtered = useMemo(() => {
    const src = monitors ?? [];
    if (statusFilter === "all") return src;
    return src.filter((m) => m.status === statusFilter);
  }, [monitors, statusFilter]);

  const monitorsByFrequency = useMemo(
    () => ({
      daily: filtered.filter((m) => m.frequency === "daily"),
      weekly: filtered.filter((m) => m.frequency === "weekly"),
    }),
    [filtered],
  );

  const indicators: IndicatorItem[] = [
    { label: "Active", value: stats.active, status: stats.active > 0 ? "active" : "neutral" },
    { label: "Paused", value: stats.paused, status: stats.paused > 0 ? "warning" : "neutral" },
    { label: "Total", value: stats.total },
    { label: "Last sweep", value: formatElapsed(stats.lastRun) },
    {
      label: "Signals",
      value: stats.totalSignals,
      status: stats.totalSignals > 0 ? "accent" : "neutral",
    },
  ];

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
  ];

  if (error) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Monitors unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header: IndicatorStrip + status tabs + New monitor */}
      <div className="flex shrink-0 items-start justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Monitors</span>
          <IndicatorStrip items={indicators} />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <div className="flex items-center gap-1">
            {STATUS_TABS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
                  "font-ui text-[12px] font-medium",
                  "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  statusFilter === value
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--subtext-0)] hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
                )}
              >
                <span>{label}</span>
                <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>

          <Button size="sm" onClick={() => { setEditingMonitor(null); setModalOpen(true); }} className="gap-1.5">
            <Plus className="h-3 w-3" />
            New monitor
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-[var(--base)]">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 font-ui text-[13px] text-[var(--overlay-1)]">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading monitors…
          </div>
        ) : (monitors ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-16 text-center">
            <p className="text-label">No monitors yet</p>
            <p className="font-ui text-[12px] text-[var(--overlay-1)]">
              Seed the default watch domains or create your first monitor.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                Seed defaults
              </Button>
              <Button size="sm" onClick={() => { setEditingMonitor(null); setModalOpen(true); }}>
                <Plus className="h-3 w-3" />
                New monitor
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-16 text-center">
            <p className="text-label">No {statusFilter} monitors</p>
            <p className="font-ui text-[12px] text-[var(--overlay-1)]">
              Switch the status tab to see others.
            </p>
          </div>
        ) : (
          (["daily", "weekly"] as const).map((cadence) => {
            const items = monitorsByFrequency[cadence];
            if (items.length === 0) return null;
            return (
              <section key={cadence}>
                <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--base)] px-6 py-2">
                  <span className="text-label capitalize">{cadence}</span>
                  <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                    {items.length}
                  </span>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {items.map((monitor) => (
                    <MonitorCard
                      key={monitor.id}
                      monitor={monitor}
                      onEdit={(m) => { setEditingMonitor(m); setModalOpen(true); }}
                      onSaved={async () => {
                        await queryClient.invalidateQueries({ queryKey: ["monitors"] });
                        await queryClient.invalidateQueries({ queryKey: ["signals"] });
                        await queryClient.invalidateQueries({
                          queryKey: ["signals", "unread-count"],
                        });
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <MonitorFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingMonitor(null); }}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["monitors"] });
          setModalOpen(false);
          setEditingMonitor(null);
        }}
        monitor={editingMonitor}
      />
    </div>
  );
}

type MonitorCardProps = {
  monitor: Monitor;
  onEdit: (monitor: Monitor) => void;
  onSaved: () => Promise<void>;
};

function MonitorCard({
  monitor,
  onEdit,
  onSaved,
}: MonitorCardProps) {
  const queryClient = useQueryClient();
  const isPaused = monitor.status === "paused";
  const color = domainColor(monitor.watch_domain);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: () =>
      updateMonitor(monitor.id, {
        status: monitor.status === "active" ? "paused" : "active",
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["monitors"] });
      const previous = queryClient.getQueryData<Monitor[]>(["monitors"]);
      const nextStatus = monitor.status === "active" ? "paused" : "active";
      queryClient.setQueryData<Monitor[]>(["monitors"], (old) =>
        (old ?? []).map((m) => (m.id === monitor.id ? { ...m, status: nextStatus } : m)),
      );
      return { previous, nextStatus };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["monitors"], context.previous);
      }
      toastError("Couldn't update monitor", err);
    },
    onSuccess: (_, __, context) => {
      toast.success(context?.nextStatus === "active" ? "Monitor resumed" : "Monitor paused");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
    },
  });

  const runMutation = useMutation({
    mutationFn: () => runMonitorNow(monitor),
    onSuccess: async (count) => {
      await onSaved();
      toast.success(count > 0 ? `+${count} new signals` : "No new signals");
    },
    onError: (err) => toastError("Run failed", err),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMonitor(monitor.id),
    onSuccess: async () => {
      await onSaved();
      toast.success("Monitor deleted");
    },
    onError: (err) => toastError("Couldn't delete monitor", err),
  });

  return (
    <div
      data-paused={isPaused ? "true" : undefined}
      className={cn(
        "group/card relative px-6 py-6",
        "transition-colors duration-150",
        isPaused ? "bg-[var(--surface-wash)]/40" : "hover:bg-[var(--surface-wash)]",
      )}
    >
      {/* Topic rail */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-full"
        style={{ background: color, opacity: isPaused ? 0.35 : 1 }}
      />

      <div className={cn("flex flex-col gap-2.5 pl-3", isPaused && "opacity-70")}>
        {/* Header: topic label + name + status pill */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color, opacity: isPaused ? 0.5 : 1 }}
              />
              <span
                className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: isPaused ? "var(--overlay-1)" : color }}
              >
                {monitor.watch_domain}
              </span>
            </div>
            <h3 className="truncate font-ui text-[14px] font-medium text-[var(--text)]">
              {monitor.name}
            </h3>
          </div>

          <StatusPill variant={isPaused ? "paused" : "active"} />
        </div>

        {/* Query */}
        <p
          className="truncate font-mono text-[12px] text-[var(--overlay-1)]"
          title={monitor.query}
        >
          {monitor.query}
        </p>

        {/* Meta + actions */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: metadata · hover icons */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--overlay-1)] tabular-nums">
              <span className="capitalize">{monitor.frequency}</span>
              <span aria-hidden className="text-[var(--overlay-0)]">·</span>
              <span>Last run {formatElapsed(monitor.last_run)}</span>
              <span aria-hidden className="text-[var(--overlay-0)]">·</span>
              <span
                className={cn(
                  (monitor.signal_count ?? 0) > 0 && !isPaused
                    ? "text-[var(--accent)]"
                    : undefined,
                )}
              >
                {monitor.signal_count ?? 0} signals
              </span>
            </div>

            <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(monitor)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Edit monitor"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--danger)]"
                title="Delete monitor"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Right: labeled action buttons */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
              className="gap-1.5"
              title={isPaused ? "Resume monitor" : "Pause monitor"}
            >
              {isPaused ? (
                <>
                  <Play className="h-3 w-3" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  Pause
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCcw
                className={cn("h-3 w-3", runMutation.isPending && "animate-spin")}
              />
              Run now
            </Button>
          </div>
        </div>
      </div>

      <DeleteMonitorModal
        open={deleteConfirmOpen}
        monitorName={monitor.name}
        isPending={deleteMutation.isPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          deleteMutation.mutate();
          setDeleteConfirmOpen(false);
        }}
      />
    </div>
  );
}

function DeleteMonitorModal({
  open, monitorName, isPending, onClose, onConfirm,
}: {
  open: boolean; monitorName: string; isPending: boolean;
  onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete monitor"
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">Delete monitor</p>
          <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">{monitorName}</h3>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <p className="font-ui text-[13px] text-[var(--subtext-0)]">
            Removes this monitor permanently. Signals it collected are not deleted.
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending} className="gap-1.5">
              <Trash2 className="h-3 w-3" />
              {isPending ? "Deleting…" : "Delete monitor"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type DraftState = {
  name: string;
  query: string;
  watch_domain: string;
  frequency: MonitorFrequency;
};

const EMPTY_DRAFT: DraftState = {
  name: "",
  query: "",
  watch_domain: WATCH_DOMAINS[0],
  frequency: "daily",
};

function MonitorFormModal({
  open,
  onClose,
  onSaved,
  monitor,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  monitor?: Monitor | null;
}) {
  const isEdit = !!monitor;
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);

  useEffect(() => {
    if (!open) return;
    if (monitor) {
      setDraft({
        name: monitor.name,
        query: monitor.query,
        watch_domain: monitor.watch_domain,
        frequency: monitor.frequency,
      });
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }, [open, monitor]);

  const createMutation = useMutation({
    mutationFn: () => createMonitor(draft),
    onSuccess: async () => {
      setDraft(EMPTY_DRAFT);
      toast.success("Monitor created");
      await onSaved();
    },
    onError: (err) => toastError("Couldn't create monitor", err),
  });

  const editMutation = useMutation({
    mutationFn: () => updateMonitor(monitor!.id, draft),
    onSuccess: async () => {
      toast.success("Monitor updated");
      await onSaved();
    },
    onError: (err) => toastError("Couldn't update monitor", err),
  });

  const isPending = createMutation.isPending || editMutation.isPending;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit =
    draft.name.trim().length > 0 &&
    draft.query.trim().length > 0 &&
    !isPending;

  const color = domainColor(draft.watch_domain);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="monitor-modal-title"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--base)] shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-label">{isEdit ? "Edit monitor" : "New monitor"}</span>
            <p className="text-meta">
              {isEdit
                ? "Update any field and save."
                : "A saved Exa search template that populates the Inbox on refresh."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Name
            </label>
            <Input
              placeholder="e.g. Crypto exit scams"
              value={draft.name}
              onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Search query
            </label>
            <Input
              placeholder="Keywords sent to Exa"
              value={draft.query}
              onChange={(event) => setDraft((d) => ({ ...d, query: event.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Watch domain
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WATCH_DOMAINS.map((domain) => {
                const active = draft.watch_domain === domain;
                const dotColor = domainColor(domain);
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, watch_domain: domain }))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
                      "font-ui text-[11px] font-medium",
                      "transition-colors duration-150",
                      active
                        ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: dotColor }}
                    />
                    <span>{domain}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Frequency
            </label>
            <div className="flex gap-1.5">
              {(["daily", "weekly"] as const).map((freq) => {
                const active = draft.frequency === freq;
                return (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, frequency: freq }))}
                    className={cn(
                      "inline-flex items-center rounded-md border px-3 py-1",
                      "font-ui text-[11px] font-medium capitalize",
                      "transition-colors duration-150",
                      active
                        ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                    )}
                  >
                    {freq}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
            <p className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Preview
            </p>
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
              />
              <span
                className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color }}
              >
                {draft.watch_domain}
              </span>
            </div>
            <p className="mt-1 font-ui text-[14px] font-medium text-[var(--text)]">
              {draft.name.trim() || <span className="text-[var(--overlay-1)]">Untitled monitor</span>}
            </p>
            <p className="mt-1 font-mono text-[12px] text-[var(--overlay-1)]">
              {draft.query.trim() || "—"}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <Button variant="ghost" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button
            onClick={() => (isEdit ? editMutation.mutate() : createMutation.mutate())}
            disabled={!canSubmit}
            size="sm"
          >
            {isPending
              ? isEdit ? "Saving…" : "Creating…"
              : isEdit ? "Save changes" : "Create monitor"}
          </Button>
        </div>
      </div>
    </div>
  );
}
