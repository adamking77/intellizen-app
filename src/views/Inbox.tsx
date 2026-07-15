import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bookmark, Filter as FilterIcon, RefreshCcw, X } from "lucide-react";

import { ProjectPickerModal } from "@/components/projects/project-picker-modal";
import { AttachInvestigationDialog } from "@/components/signals/attach-investigation-dialog";
import { SignalCard } from "@/components/signals/signal-card";
import { SignalDetail } from "@/components/signals/signal-detail";
import { Button } from "@/components/ui/button";
import { IndicatorStrip, type IndicatorItem } from "@/components/ui/indicator-strip";
import { LABELS } from "@/lib/labels";
import { domainColor } from "@/lib/domains";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  addSignalToInvestigation,
  bulkDismissSignals,
  dismissSignal,
  listInvestigations,
  listMonitors,
  listSignals,
  refreshInbox,
  saveSignalToProject,
} from "@/lib/data";
import type { IntelSignal } from "@/lib/types";
import { useAppStore } from "@/store";

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
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedSignal, setSelectedSignal] = useState<IntelSignal | null>(null);
  const [saveTarget, setSaveTarget] = useState<IntelSignal | null>(null);
  const [attachTarget, setAttachTarget] = useState<IntelSignal | null>(null);
  const [attachCaseId, setAttachCaseId] = useState<string | null>(null);

  // Filter state
  const [activeDomains, setActiveDomains] = useState<Set<string>>(() => new Set());

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkSaveOpen, setBulkSaveOpen] = useState(false);

  // Filter popover
  const [filterOpen, setFilterOpen] = useState(false);

  // Resizable detail panel width
  const [detailWidth, setDetailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 400;
    const saved = window.localStorage.getItem("inbox-detail-width");
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(parsed) ? Math.max(280, Math.min(720, parsed)) : 400;
  });

  useEffect(() => {
    window.localStorage.setItem("inbox-detail-width", String(detailWidth));
  }, [detailWidth]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = detailWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setDetailWidth(Math.max(280, Math.min(720, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const feedRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const { data: signals, isLoading } = useQuery({
    queryKey: ["signals", entityFilter],
    queryFn: () => listSignals({ entity: entityFilter }),
  });

  const { data: investigations } = useQuery({
    queryKey: ["investigations", entityFilter],
    queryFn: () => listInvestigations({ entity: entityFilter }),
  });

  const { data: monitors } = useQuery({
    queryKey: ["monitors", entityFilter],
    queryFn: () => listMonitors({ entity: entityFilter }),
    staleTime: 30_000,
  });

  const activeInvestigations = useMemo(
    () => (investigations ?? []).filter((i) => i.status === "active"),
    [investigations],
  );

  const refreshMutation = useMutation({
    mutationFn: refreshInbox,
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: ["signals"] });
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
      if (count === 0) toast.info("No new signals");
    },
    onError: (err) => toastError("Refresh failed", err),
  });

  const dismissMutation = useMutation({
    mutationFn: dismissSignal,
    onMutate: async (signalId) => {
      await queryClient.cancelQueries({ queryKey: ["signals"] });
      const previous = queryClient.getQueryData<IntelSignal[]>(["signals"]);
      queryClient.setQueryData<IntelSignal[]>(["signals"], (old) =>
        (old ?? []).filter((s) => s.id !== signalId),
      );
      if (selectedSignal?.id === signalId) setSelectedSignal(null);
      return { previous };
    },
    onError: (err, _signalId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["signals"], context.previous);
      }
      toastError("Couldn't archive signal", err);
    },
    onSuccess: () => toast.success("Signal archived"),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signals"] });
      await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
    },
  });

  const attachMutation = useMutation({
    mutationFn: (input: { investigationId: number; signalId: number }) =>
      addSignalToInvestigation(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["investigation-signals"], exact: false });
      toast.success("Attached to investigation");
    },
    onError: (err) => toastError("Couldn't attach signal", err),
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: (ids: number[]) => bulkDismissSignals(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["signals"] });
      const previous = queryClient.getQueryData<IntelSignal[]>(["signals"]);
      const idSet = new Set(ids);
      queryClient.setQueryData<IntelSignal[]>(["signals"], (old) =>
        (old ?? []).filter((s) => !idSet.has(s.id)),
      );
      if (selectedSignal && idSet.has(selectedSignal.id)) setSelectedSignal(null);
      return { previous };
    },
    onError: (err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["signals"], context.previous);
      }
      toastError("Clear failed", err);
    },
    onSuccess: ({ total, cleared }) => {
      clearSelection();
      const skipped = total - cleared;
      if (skipped === 0) toast.success(`Cleared ${cleared} signal${cleared === 1 ? "" : "s"}`);
      else toast.success(`Cleared ${cleared} signal${cleared === 1 ? "" : "s"} — ${skipped} kept (saved to project or investigation)`);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signals"] });
      await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
    },
  });

  // Domains from monitors — drives the filter chip row (not from signal history)
  const allDomains = useMemo(() => {
    const set = new Set<string>();
    for (const m of monitors ?? []) {
      if (m.watch_domain) set.add(m.watch_domain);
    }
    return Array.from(set).sort();
  }, [monitors]);

  const { grouped, visible, counts } = useMemo(() => {
    const all = signals ?? [];
    const counts = {
      all: all.length,
      new: all.filter((s) => s.status === "new").length,
      saved: all.filter((s) => s.status === "saved").length,
    };

    const byStatus = filter === "all" ? all : all.filter((s) => s.status === filter);
    const byDomain =
      activeDomains.size === 0
        ? byStatus
        : byStatus.filter((s) => activeDomains.has(s.watch_domain ?? "Manual"));

    const grouped = byDomain.reduce<Record<string, IntelSignal[]>>((acc, signal) => {
      const key = signal.watch_domain ?? "Manual";
      acc[key] = [...(acc[key] ?? []), signal];
      return acc;
    }, {});
    return { grouped, visible: byDomain, counts };
  }, [filter, signals, activeDomains]);

  // Click-outside handler for filter popover
  useEffect(() => {
    if (!filterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!filterPopoverRef.current) return;
      if (filterPopoverRef.current.contains(e.target as Node)) return;
      setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [filterOpen]);

  // Clear any selected ids that are no longer visible (after filter change)
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(visible.map((s) => s.id));
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visible]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = () => setSelectedIds(new Set(visible.map((s) => s.id)));

  const toggleDomain = (domain: string) => {
    setActiveDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

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

  // Keyboard navigation
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
      if (list.length === 0 && e.key !== "Escape") return;

      const currentIdx = selectedSignal
        ? list.findIndex((s) => s.id === selectedSignal.id)
        : -1;

      const hasBulkSelection = selectedIds.size > 0;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = list[Math.min(list.length - 1, currentIdx + 1)] ?? list[0];
        setSelectedSignal(next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = list[Math.max(0, currentIdx - 1)] ?? list[0];
        setSelectedSignal(prev);
      } else if (e.key === "Escape") {
        if (filterOpen) setFilterOpen(false);
        else if (hasBulkSelection) clearSelection();
        else setSelectedSignal(null);
      } else if (e.key === "x" && selectedSignal) {
        e.preventDefault();
        toggleSelect(selectedSignal.id);
      } else if (e.key === "a") {
        e.preventDefault();
        if (hasBulkSelection) {
          bulkArchiveMutation.mutate(Array.from(selectedIds));
        } else if (selectedSignal) {
          dismissMutation.mutate(selectedSignal.id);
        }
      } else if (e.key === "e" && selectedSignal) {
        e.preventDefault();
        setAttachTarget(selectedSignal);
        setAttachCaseId((c) => c ?? activeInvestigations[0]?.case_id ?? null);
      } else if (e.key === "s") {
        e.preventDefault();
        if (hasBulkSelection) {
          setBulkSaveOpen(true);
        } else if (selectedSignal) {
          setSaveTarget(selectedSignal);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedSignal, selectedIds, dismissMutation, bulkArchiveMutation, activeInvestigations, filterOpen]);

  const FILTERS: { value: InboxFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "new", label: "New", count: counts.new },
    { value: "saved", label: "Saved", count: counts.saved },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header: IndicatorStrip + filters + refresh */}
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Inbox</span>
          <IndicatorStrip items={indicators} />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            {FILTERS.map(({ value, label, count }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
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
            {refreshMutation.data != null && refreshMutation.data > 0 ? (
              <span className="font-mono text-[11px] text-[var(--success)]">
                +{refreshMutation.data} new
              </span>
            ) : null}
            {visible.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => bulkArchiveMutation.mutate(visible.map((s) => s.id))}
                disabled={bulkArchiveMutation.isPending}
                className="gap-1.5 text-[var(--subtext-0)]"
              >
                <Archive className="h-3 w-3" />
                Clear all
              </Button>
            ) : null}
            <div ref={filterPopoverRef} className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            aria-haspopup="listbox"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-1",
              "font-ui text-[12px] font-medium",
              "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
              activeDomains.size > 0 || filterOpen
                ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--mantle)] text-[var(--subtext-0)] hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
            )}
          >
            <FilterIcon className="h-3 w-3" />
            <span>Filter</span>
            {activeDomains.size > 0 ? (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] text-[var(--base)]">
                {activeDomains.size}
              </span>
            ) : null}
          </button>

          {filterOpen ? (
            <div className="absolute right-0 top-full z-20 mt-1 w-[280px] rounded-md border border-[var(--border)] bg-[var(--mantle)] p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Topics
                </span>
                {activeDomains.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveDomains(new Set())}
                    className="font-ui text-[10px] text-[var(--overlay-1)] hover:text-[var(--text)]"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {allDomains.length === 0 ? (
                <p className="px-1 py-2 font-ui text-[11px] text-[var(--overlay-1)]">
                  No topics available — run Refresh to populate signals.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {allDomains.map((domain) => {
                    const active = activeDomains.has(domain);
                    const color = domainColor(domain);
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => toggleDomain(domain)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1",
                          "font-ui text-[11px] font-medium",
                          "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          active
                            ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-transparent text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                        )}
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: color }}
                        />
                        <span>{domain}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
            </div>
            <Button
              size="sm"
              variant="primary"
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
                    <span className="text-label" style={{ color: domainColor(domain) }}>
                      {domain}
                    </span>
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
                      isSelected={selectedIds.has(signal.id)}
                      selectionActive={selectedIds.size > 0}
                      onClick={() =>
                        setSelectedSignal((prev) =>
                          prev?.id === signal.id ? null : signal,
                        )
                      }
                      onToggleSelect={(e) => {
                        if (e.shiftKey) {
                          // Range select: from last-selected anchor to this row
                          const ids = visible.map((s) => s.id);
                          const thisIdx = ids.indexOf(signal.id);
                          const anchors = Array.from(selectedIds);
                          const lastAnchor = anchors[anchors.length - 1];
                          const anchorIdx = lastAnchor != null ? ids.indexOf(lastAnchor) : -1;
                          if (anchorIdx >= 0 && thisIdx >= 0) {
                            const [lo, hi] = anchorIdx < thisIdx ? [anchorIdx, thisIdx] : [thisIdx, anchorIdx];
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              for (let i = lo; i <= hi; i += 1) next.add(ids[i]);
                              return next;
                            });
                            return;
                          }
                        }
                        toggleSelect(signal.id);
                      }}
                      onSave={() => setSaveTarget(signal)}
                      onDismiss={() => dismissMutation.mutate(signal.id)}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}

          {/* Bulk action bar — floats above keyboard hints when selection exists */}
          {selectedIds.size > 0 ? (
            <div className="flex shrink-0 items-center gap-3 border-t border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3">
              <span className="font-ui text-[12px] font-medium text-[var(--accent)]">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={selectAllVisible}
                className="font-ui text-[11px] text-[var(--subtext-0)] hover:text-[var(--text)]"
                disabled={selectedIds.size === visible.length}
              >
                Select all {visible.length}
              </button>
              <span className="h-3 w-px bg-[var(--border)]" aria-hidden />
              <button
                type="button"
                onClick={() => bulkArchiveMutation.mutate(Array.from(selectedIds))}
                disabled={bulkArchiveMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-ui text-[12px] font-medium text-[var(--subtext-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)] disabled:opacity-50"
              >
                <Archive className="h-3 w-3" />
                Clear
              </button>
              <button
                type="button"
                onClick={() => setBulkSaveOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-ui text-[12px] font-medium text-[var(--subtext-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <Bookmark className="h-3 w-3" />
                Save to {LABELS.collection.toLowerCase()}…
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 font-ui text-[11px] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            </div>
          ) : null}

          {/* Keyboard hint footer */}
          <div className="flex h-10 shrink-0 items-center gap-4 border-t border-[var(--border)] bg-[var(--base)] px-4">
            <KeyHint keys="j k" label="Navigate" />
            <KeyHint keys="x" label="Select" />
            <KeyHint keys="s" label={selectedIds.size > 0 ? "Bulk save" : "Save"} />
            <KeyHint keys="e" label="Attach" />
            <KeyHint keys="a" label={selectedIds.size > 0 ? "Bulk clear" : "Clear"} />
            <KeyHint keys="/" label="Filter" />
            <KeyHint keys="esc" label={selectedIds.size > 0 ? "Clear selection" : "Close"} />
          </div>
        </div>

        {/* Detail panel — slides in when a signal is selected */}
        {selectedSignal ? (
          <aside
            key={selectedSignal.id}
            style={{ width: detailWidth }}
            className="inbox-detail-panel relative shrink-0 overflow-hidden border-l border-[var(--border)] bg-[var(--base)]"
          >
            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize reading panel"
              onMouseDown={startResize}
              onDoubleClick={() => setDetailWidth(400)}
              className="group/resize absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[2px] bg-transparent transition-colors duration-150 group-hover/resize:bg-[var(--accent)]/60 group-active/resize:bg-[var(--accent)]"
              />
            </div>
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

      <ProjectPickerModal
        open={saveTarget !== null}
        onClose={() => setSaveTarget(null)}
        onSelect={async (projectId) => {
          if (!saveTarget) return;
          try {
            await saveSignalToProject({ projectId, signalId: saveTarget.id });
            await queryClient.invalidateQueries({ queryKey: ["signals"] });
            await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
            toast.success(`Saved to ${LABELS.collection.toLowerCase()}`);
          } catch (err) {
            toastError("Couldn't save signal", err);
          } finally {
            setSaveTarget(null);
          }
        }}
        title={saveTarget ? `Save "${saveTarget.title}"` : `Attach to ${LABELS.collection.toLowerCase()}`}
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

      <ProjectPickerModal
        open={bulkSaveOpen}
        onClose={() => setBulkSaveOpen(false)}
        onSelect={async (projectId) => {
          const ids = Array.from(selectedIds);
          if (ids.length === 0) return;
          const results = await Promise.allSettled(
            ids.map((id) => saveSignalToProject({ projectId, signalId: id })),
          );
          const failed = results.filter((r) => r.status === "rejected").length;
          await queryClient.invalidateQueries({ queryKey: ["signals"] });
          await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
          await queryClient.invalidateQueries({ queryKey: ["projects"] });
          const saved = ids.length - failed;
          if (failed === 0) {
            toast.success(`Saved ${saved} signal${saved === 1 ? "" : "s"}`);
          } else {
            toast.error(`Saved ${saved} of ${ids.length} — ${failed} failed`);
          }
          clearSelection();
          setBulkSaveOpen(false);
        }}
        title={`Save ${selectedIds.size} signal${selectedIds.size === 1 ? "" : "s"} to ${LABELS.collection.toLowerCase()}`}
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
