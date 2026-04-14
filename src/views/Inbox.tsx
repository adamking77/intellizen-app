import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";

import { ProjectPickerDrawer } from "@/components/projects/project-picker-drawer";
import { AttachInvestigationDialog } from "@/components/signals/attach-investigation-dialog";
import { SignalCard } from "@/components/signals/signal-card";
import { SignalDetail } from "@/components/signals/signal-detail";
import { Button } from "@/components/ui/button";
import { IndicatorStrip, type IndicatorItem } from "@/components/ui/indicator-strip";
import { cn } from "@/lib/utils";
import {
  addSignalToInvestigation,
  dismissSignal,
  listInvestigations,
  listMonitors,
  listSignals,
  refreshInbox,
  saveSignalToProject,
} from "@/lib/data";
import type { IntelSignal } from "@/lib/types";

type InboxFilter = "all" | "new" | "saved";

function formatElapsed(iso: string | null | undefined): string {
  if (!iso) return "—";
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

export function InboxView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedSignal, setSelectedSignal] = useState<IntelSignal | null>(null);
  const [saveTarget, setSaveTarget] = useState<IntelSignal | null>(null);
  const [attachTarget, setAttachTarget] = useState<IntelSignal | null>(null);
  const [attachCaseId, setAttachCaseId] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);

  const { data: signals, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: listSignals,
  });

  const { data: investigations } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });

  const { data: monitors } = useQuery({
    queryKey: ["monitors"],
    queryFn: listMonitors,
    staleTime: 30_000,
  });

  const activeInvestigations = useMemo(
    () => (investigations ?? []).filter((i) => i.status === "active"),
    [investigations],
  );

  const refreshMutation = useMutation({
    mutationFn: refreshInbox,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signals"] });
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: dismissSignal,
    onSuccess: async (_, signalId) => {
      if (selectedSignal?.id === signalId) setSelectedSignal(null);
      await queryClient.invalidateQueries({ queryKey: ["signals"] });
      await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
    },
  });

  const attachMutation = useMutation({
    mutationFn: (input: { investigationId: number; signalId: number }) =>
      addSignalToInvestigation(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["investigation-signals"], exact: false });
    },
  });

  const { grouped, visible, counts } = useMemo(() => {
    const all = signals ?? [];
    const counts = {
      all: all.length,
      new: all.filter((s) => s.status === "new").length,
      saved: all.filter((s) => s.status === "saved").length,
    };
    const visible = filter === "all" ? all : all.filter((s) => s.status === filter);
    const grouped = visible.reduce<Record<string, IntelSignal[]>>((acc, signal) => {
      const key = signal.watch_domain ?? "Manual";
      acc[key] = [...(acc[key] ?? []), signal];
      return acc;
    }, {});
    return { grouped, visible, counts };
  }, [filter, signals]);

  // Monitor telemetry
  const monitorStats = useMemo(() => {
    const list = monitors ?? [];
    const active = list.filter((m) => m.status === "active").length;
    const lastRun = list
      .map((m) => m.last_run)
      .filter(Boolean)
      .sort()
      .pop();
    return { active, total: list.length, lastRun };
  }, [monitors]);

  const indicators: IndicatorItem[] = [
    {
      label: "Unread",
      value: counts.new,
      status: counts.new > 0 ? "accent" : "neutral",
    },
    { label: "Total", value: counts.all },
    {
      label: "Monitors",
      value: `${monitorStats.active}/${monitorStats.total}`,
      status: monitorStats.active > 0 ? "active" : "neutral",
    },
    {
      label: "Last refresh",
      value: formatElapsed(monitorStats.lastRun),
      status: "neutral",
    },
  ];

  // Keyboard navigation (j/k + e/a + enter + esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (inField) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const list = visible;
      if (list.length === 0) return;

      const currentIdx = selectedSignal
        ? list.findIndex((s) => s.id === selectedSignal.id)
        : -1;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = list[Math.min(list.length - 1, currentIdx + 1)] ?? list[0];
        setSelectedSignal(next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = list[Math.max(0, currentIdx - 1)] ?? list[0];
        setSelectedSignal(prev);
      } else if (e.key === "Escape") {
        setSelectedSignal(null);
      } else if (e.key === "a" && selectedSignal) {
        e.preventDefault();
        dismissMutation.mutate(selectedSignal.id);
      } else if (e.key === "e" && selectedSignal) {
        e.preventDefault();
        setAttachTarget(selectedSignal);
        setAttachCaseId((c) => c ?? activeInvestigations[0]?.case_id ?? null);
      } else if (e.key === "s" && selectedSignal) {
        e.preventDefault();
        setSaveTarget(selectedSignal);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedSignal, dismissMutation, activeInvestigations]);

  const FILTERS: { value: InboxFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "new", label: "New", count: counts.new },
    { value: "saved", label: "Saved", count: counts.saved },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header: IndicatorStrip + filters + refresh */}
      <div className="flex shrink-0 items-start justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Inbox</span>
          <IndicatorStrip items={indicators} />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <div className="flex items-center gap-1">
            {FILTERS.map(({ value, label, count }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
                  "font-ui text-[12px] font-medium",
                  "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  filter === value
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--subtext-0)] hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
                )}
              >
                <span>{label}</span>
                <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {refreshMutation.data != null ? (
              <span className="font-mono text-[11px] text-[var(--success)]">
                +{refreshMutation.data} new
              </span>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCcw
                className={cn("h-3 w-3", refreshMutation.isPending && "animate-spin")}
              />
              {refreshMutation.isPending ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      {/* Content: feed + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Signal feed */}
        <div
          ref={feedRef}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-ui text-[13px] text-[var(--overlay-1)]">
                Loading signals…
              </p>
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-label">No signals</p>
              <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                {filter === "all"
                  ? "Run Refresh to pull from active monitors."
                  : `No ${filter} signals.`}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {Object.entries(grouped).map(([domain, items]) => (
                <section key={domain}>
                  {/* Domain group header — flat */}
                  <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4 py-2">
                    <span className="text-label">{domain}</span>
                    <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                      {items.length}
                    </span>
                  </div>

                  {items.map((signal) => (
                    <SignalCard
                      key={signal.id}
                      title={signal.title}
                      url={signal.url}
                      source={signal.source}
                      publishedAt={signal.published_at}
                      watchDomain={signal.watch_domain}
                      snippet={signal.snippet}
                      score={signal.exa_score}
                      isActive={selectedSignal?.id === signal.id}
                      onClick={() =>
                        setSelectedSignal((prev) =>
                          prev?.id === signal.id ? null : signal,
                        )
                      }
                      onSave={() => setSaveTarget(signal)}
                      onDismiss={() => dismissMutation.mutate(signal.id)}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}

          {/* Keyboard hint footer */}
          <div className="flex shrink-0 items-center gap-4 border-t border-[var(--border)] bg-[var(--base)] px-4 py-2">
            <KeyHint keys="j k" label="Navigate" />
            <KeyHint keys="s" label="Save" />
            <KeyHint keys="e" label="Attach" />
            <KeyHint keys="a" label="Archive" />
            <KeyHint keys="esc" label="Close" />
          </div>
        </div>

        {/* Detail panel — slides in when a signal is selected */}
        {selectedSignal ? (
          <aside
            key={selectedSignal.id}
            className="inbox-detail-panel w-[320px] shrink-0 overflow-hidden border-l border-[var(--border)] bg-[var(--base)] lg:w-[360px] xl:w-[400px]"
          >
            <SignalDetail
              signal={selectedSignal}
              onSave={(signal) => setSaveTarget(signal)}
              onAttach={(signal) => {
                setAttachTarget(signal);
                setAttachCaseId((current) => current ?? activeInvestigations[0]?.case_id ?? null);
              }}
              onDismiss={(id) => dismissMutation.mutate(id)}
            />
          </aside>
        ) : null}
      </div>

      <ProjectPickerDrawer
        open={saveTarget !== null}
        onClose={() => setSaveTarget(null)}
        onSelect={async (projectId) => {
          if (!saveTarget) return;
          await saveSignalToProject({ projectId, signalId: saveTarget.id });
          await queryClient.invalidateQueries({ queryKey: ["signals"] });
          await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
          setSaveTarget(null);
        }}
        title={saveTarget ? `Save "${saveTarget.title}"` : "Attach to project"}
      />

      <AttachInvestigationDialog
        signal={attachTarget}
        investigations={activeInvestigations}
        selectedCaseId={attachCaseId}
        onSelectCaseId={setAttachCaseId}
        onCancel={() => {
          setAttachTarget(null);
          setAttachCaseId(null);
        }}
        onConfirm={(investigationId) => {
          if (!attachTarget) return;
          attachMutation.mutate(
            { investigationId, signalId: attachTarget.id },
            {
              onSuccess: () => {
                setAttachTarget(null);
                setAttachCaseId(null);
              },
            },
          );
        }}
        isSubmitting={attachMutation.isPending}
      />
    </div>
  );
}

function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="inline-flex min-w-[16px] items-center justify-center rounded border border-[var(--border)] bg-[var(--mantle)] px-1 font-mono text-[10px] text-[var(--subtext-0)]">
        {keys}
      </kbd>
      <span className="font-ui text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">
        {label}
      </span>
    </span>
  );
}
