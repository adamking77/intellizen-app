import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Play, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  runMonitorNow,
  seedDefaultMonitors,
  updateMonitor,
} from "@/lib/data";
import type { Monitor, MonitorFrequency } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { WATCH_DOMAINS } from "@/lib/watch-domains";

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

export function MonitorsView() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingQuery, setEditingQuery] = useState("");

  const { data: monitors, isLoading, error } = useQuery({
    queryKey: ["monitors"],
    queryFn: listMonitors,
  });

  const createMutation = useMutation({
    mutationFn: () => createMonitor(draft),
    onSuccess: async () => {
      setDraft(EMPTY_DRAFT);
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
    },
  });

  const seedMutation = useMutation({
    mutationFn: seedDefaultMonitors,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
    },
  });

  const monitorsByFrequency = useMemo(() => {
    const source = monitors ?? [];
    return {
      daily: source.filter((monitor) => monitor.frequency === "daily"),
      weekly: source.filter((monitor) => monitor.frequency === "weekly"),
    };
  }, [monitors]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monitors unavailable</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>New monitor</CardTitle>
          <CardDescription>
            Saved Exa search templates that populate the Inbox on refresh.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Monitor name"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
          <Input
            placeholder="Search query"
            value={draft.query}
            onChange={(event) =>
              setDraft((current) => ({ ...current, query: event.target.value }))
            }
          />
          <select
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
            value={draft.watch_domain}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                watch_domain: event.target.value,
              }))
            }
          >
            {WATCH_DOMAINS.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
          <select
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
            value={draft.frequency}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                frequency: event.target.value as MonitorFrequency,
              }))
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={() => createMutation.mutate()}
              disabled={!draft.name.trim() || !draft.query.trim() || createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? "Creating..." : "Create monitor"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              Seed defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {(["daily", "weekly"] as const).map((frequency) => (
          <Card key={frequency}>
            <CardHeader>
              <CardTitle className="capitalize">{frequency} monitors</CardTitle>
              <CardDescription>
                {frequency === "daily"
                  ? "High-tempo domains intended for regular refreshes."
                  : "Lower-frequency coverage for strategic context and ambient shifts."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {isLoading ? (
                <div className="flex items-center gap-3 text-sm text-[var(--foreground-muted)]">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading monitors...
                </div>
              ) : monitorsByFrequency[frequency].length === 0 ? (
                <p className="text-sm text-[var(--foreground-muted)]">
                  No {frequency} monitors yet.
                </p>
              ) : (
                monitorsByFrequency[frequency].map((monitor) => (
                  <MonitorCard
                    key={monitor.id}
                    monitor={monitor}
                    editingId={editingId}
                    editingQuery={editingQuery}
                    onEditingQueryChange={setEditingQuery}
                    onStartEdit={(item) => {
                      setEditingId(item.id);
                      setEditingQuery(item.query);
                    }}
                    onCancelEdit={() => {
                      setEditingId(null);
                      setEditingQuery("");
                    }}
                    onSaved={async () => {
                      setEditingId(null);
                      setEditingQuery("");
                      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
                      await queryClient.invalidateQueries({ queryKey: ["signals"] });
                      await queryClient.invalidateQueries({
                        queryKey: ["signals", "unread-count"],
                      });
                    }}
                  />
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type MonitorCardProps = {
  monitor: Monitor;
  editingId: number | null;
  editingQuery: string;
  onEditingQueryChange: (value: string) => void;
  onStartEdit: (monitor: Monitor) => void;
  onCancelEdit: () => void;
  onSaved: () => Promise<void>;
};

function MonitorCard({
  monitor,
  editingId,
  editingQuery,
  onEditingQueryChange,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: MonitorCardProps) {
  const editing = editingId === monitor.id;

  const saveMutation = useMutation({
    mutationFn: () => updateMonitor(monitor.id, { query: editingQuery }),
    onSuccess: onSaved,
  });

  const toggleMutation = useMutation({
    mutationFn: () =>
      updateMonitor(monitor.id, {
        status: monitor.status === "active" ? "paused" : "active",
      }),
    onSuccess: onSaved,
  });

  const runMutation = useMutation({
    mutationFn: () => runMonitorNow(monitor),
    onSuccess: onSaved,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMonitor(monitor.id),
    onSuccess: onSaved,
  });

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[var(--foreground)]">{monitor.name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
            {monitor.watch_domain} · {monitor.status} · {monitor.signal_count} signals
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => onStartEdit(monitor)}>
            Edit query
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toggleMutation.mutate()}>
            {monitor.status === "active" ? "Pause" : "Resume"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => runMutation.mutate()}>
            <Play className="h-4 w-4" />
            Run now
          </Button>
          <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {editing ? (
          <div className="space-y-3">
            <Input
              value={editingQuery}
              onChange={(event) => onEditingQueryChange(event.target.value)}
            />
            <div className="flex gap-3">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                Save query
              </Button>
              <Button variant="ghost" onClick={onCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-[var(--foreground-muted)]">
            {monitor.query}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
        <span>Frequency {monitor.frequency}</span>
        <span>Last run {formatDateTime(monitor.last_run)}</span>
      </div>
    </div>
  );
}
