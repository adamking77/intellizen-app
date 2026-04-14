import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";

import { ProjectPickerDrawer } from "@/components/projects/project-picker-drawer";
import { AttachInvestigationDialog } from "@/components/signals/attach-investigation-dialog";
import { SignalCard } from "@/components/signals/signal-card";
import { SignalDetail } from "@/components/signals/signal-detail";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addSignalToInvestigation,
  dismissSignal,
  listInvestigations,
  listSignals,
  refreshInbox,
  saveSignalToProject,
} from "@/lib/data";
import type { IntelSignal } from "@/lib/types";

type InboxFilter = "all" | "new" | "saved";

export function InboxView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedSignal, setSelectedSignal] = useState<IntelSignal | null>(null);
  const [saveTarget, setSaveTarget] = useState<IntelSignal | null>(null);
  const [attachTarget, setAttachTarget] = useState<IntelSignal | null>(null);
  const [attachCaseId, setAttachCaseId] = useState<string | null>(null);

  const { data: signals, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: listSignals,
  });

  const { data: investigations } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });

  const activeInvestigations = useMemo(
    () => (investigations ?? []).filter((investigation) => investigation.status === "active"),
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

  const { grouped, counts } = useMemo(() => {
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

    return { grouped, counts };
  }, [filter, signals]);

  const FILTERS: { value: InboxFilter; label: string }[] = [
    { value: "all",   label: `All ${counts.all}`   },
    { value: "new",   label: `New ${counts.new}`   },
    { value: "saved", label: `Saved ${counts.saved}` },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--panel)]/80 px-5 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <span className="mr-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-dim)]">
            Inbox
          </span>
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-150",
                filter === value
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                  : "text-[var(--foreground-dim)] hover:text-[var(--foreground-muted)] hover:bg-white/[0.03]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {refreshMutation.data != null ? (
            <span className="text-[11px] text-[var(--success)]">
              +{refreshMutation.data} new
            </span>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="gap-2"
          >
            <RefreshCcw
              className={cn("h-3.5 w-3.5", refreshMutation.isPending && "animate-spin")}
            />
            {refreshMutation.isPending ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Content: feed + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Signal feed */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-[var(--border)]">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-[var(--foreground-dim)]">Loading signals…</p>
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm font-medium text-[var(--foreground-muted)]">
                {filter === "all"
                  ? "No signals yet — run Refresh to pull from active monitors."
                  : `No ${filter} signals.`}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {Object.entries(grouped).map(([domain, items]) => (
                <section key={domain}>
                  {/* Domain group header */}
                  <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 py-2 backdrop-blur-sm">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-dim)]">
                      {domain}
                    </span>
                    <span className="rounded-full bg-[var(--surface-strong)] px-1.5 py-px text-[10px] font-semibold text-[var(--foreground-dim)]">
                      {items.length}
                    </span>
                  </div>

                  {/* Signal rows */}
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
                          prev?.id === signal.id ? null : signal
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
        </div>

        {/* Detail panel */}
        <div className="w-[360px] shrink-0 overflow-hidden xl:w-[400px]">
          <SignalDetail
            signal={selectedSignal}
            onSave={(signal) => setSaveTarget(signal)}
            onAttach={(signal) => {
              setAttachTarget(signal);
              setAttachCaseId((current) => current ?? activeInvestigations[0]?.case_id ?? null);
            }}
            onDismiss={(id) => dismissMutation.mutate(id)}
          />
        </div>
      </div>

      {/* Project picker drawer */}
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
