import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";

import { ProjectPickerDrawer } from "@/components/projects/project-picker-drawer";
import { SignalCard } from "@/components/signals/signal-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  dismissSignal,
  listSignals,
  refreshInbox,
  saveSignalToProject,
} from "@/lib/data";
import type { IntelSignal } from "@/lib/types";

type InboxFilter = "all" | "new" | "saved";

export function InboxView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [activeSignal, setActiveSignal] = useState<IntelSignal | null>(null);

  const { data: signals, error, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: listSignals,
  });

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signals"] });
      await queryClient.invalidateQueries({ queryKey: ["signals", "unread-count"] });
    },
  });

  const groupedSignals = useMemo(() => {
    const visible = (signals ?? []).filter((signal) => {
      if (filter === "all") return true;
      return signal.status === filter;
    });

    return visible.reduce<Record<string, IntelSignal[]>>((accumulator, signal) => {
      const key = signal.watch_domain ?? "Manual";
      accumulator[key] = [...(accumulator[key] ?? []), signal];
      return accumulator;
    }, {});
  }, [filter, signals]);

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted-foreground)]">
        {error.message}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "new", "saved"] as const).map((value) => (
            <Button
              key={value}
              variant={filter === value ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value === "new" ? "New" : "Saved"}
            </Button>
          ))}
        </div>
        <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
          <RefreshCcw className="h-4 w-4" />
          {refreshMutation.isPending ? "Refreshing..." : "Refresh Inbox"}
        </Button>
      </div>

      {refreshMutation.data ? (
        <Badge variant="success">Inserted {refreshMutation.data} new signals</Badge>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted-foreground)]">
          Loading saved signals...
        </div>
      ) : Object.keys(groupedSignals).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted-foreground)]">
          No signals in the current filter. Run Refresh to pull from active monitors.
        </div>
      ) : (
        <div className="grid gap-6">
          {Object.entries(groupedSignals).map(([domain, items]) => (
            <section key={domain} className="grid gap-4">
              <div className="flex items-center gap-3">
                <h3 className="font-serif text-2xl">{domain}</h3>
                <Badge variant="neutral">{items.length}</Badge>
              </div>
              <div className="grid gap-4">
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
                    actions={
                      <>
                        <Button size="sm" onClick={() => setActiveSignal(signal)}>
                          Save to Project
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => dismissMutation.mutate(signal.id)}
                        >
                          Dismiss
                        </Button>
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProjectPickerDrawer
        open={activeSignal !== null}
        onClose={() => setActiveSignal(null)}
        onSelect={async (projectId) => {
          if (!activeSignal) return;

          await saveSignalToProject({ projectId, signalId: activeSignal.id });
          await queryClient.invalidateQueries({ queryKey: ["signals"] });
          await queryClient.invalidateQueries({
            queryKey: ["signals", "unread-count"],
          });
        }}
        title={activeSignal ? `Save "${activeSignal.title}"` : "Attach to project"}
      />
    </>
  );
}
