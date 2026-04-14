import { Bookmark, ExternalLink, Radar, Target, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { IntelSignal } from "@/lib/types";
import { DOMAIN_STYLES } from "./signal-card";

type SignalDetailProps = {
  signal: IntelSignal | null;
  onSave: (signal: IntelSignal) => void;
  onAttach: (signal: IntelSignal) => void;
  onDismiss: (signalId: number) => void;
};

export function SignalDetail({ signal, onSave, onAttach, onDismiss }: SignalDetailProps) {
  if (!signal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <Radar className="h-6 w-6 text-[var(--foreground-dim)]" />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--foreground-muted)]">No signal selected</p>
          <p className="mt-1 text-xs text-[var(--foreground-dim)]">
            Select a signal from the feed to view details
          </p>
        </div>
      </div>
    );
  }

  const style = (signal.watch_domain ? DOMAIN_STYLES[signal.watch_domain] : null);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border)] p-5">
        <div className="mb-3 flex items-center gap-2">
          {signal.watch_domain && style ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                style.badge
              )}
            >
              {signal.watch_domain}
            </span>
          ) : null}
          {typeof signal.exa_score === "number" ? (
            <span
              className={cn(
                "ml-auto font-mono text-xs font-semibold tabular-nums",
                signal.exa_score > 0.7
                  ? "text-[var(--accent)]"
                  : signal.exa_score > 0.5
                    ? "text-[var(--warning)]"
                    : "text-[var(--foreground-dim)]"
              )}
            >
              Score {signal.exa_score.toFixed(3)}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void openUrl(signal.url)}
          className="group/link inline-flex items-start gap-2 text-left hover:text-[var(--accent)]"
        >
          <h2 className="text-[15px] font-semibold leading-snug text-[var(--foreground)] transition-colors duration-100 group-hover/link:text-[var(--accent)]">
            {signal.title}
          </h2>
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--foreground-dim)] group-hover/link:text-[var(--accent)]" />
        </button>
      </div>

      {/* Meta row */}
      <div className="shrink-0 border-b border-[var(--border)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--foreground-dim)]">
          {signal.source ? (
            <span className="font-medium text-[var(--foreground-muted)]">{signal.source}</span>
          ) : null}
          <span>{formatDate(signal.published_at)}</span>
          <span className="font-mono text-[var(--foreground-dim)]">
            {new URL(signal.url).hostname}
          </span>
        </div>
      </div>

      {/* Snippet */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {signal.snippet ? (
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">{signal.snippet}</p>
        ) : (
          <p className="text-sm italic text-[var(--foreground-dim)]">No snippet available.</p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-[var(--border)] p-4">
        <div className="flex gap-2">
          <Button
            className="flex-1 gap-2"
            onClick={() => onSave(signal)}
          >
            <Bookmark className="h-4 w-4" />
            Save to Project
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => onAttach(signal)}
          >
            <Target className="h-4 w-4" />
            Attach
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-[var(--foreground-dim)] hover:text-[var(--danger)]"
            onClick={() => onDismiss(signal.id)}
            title="Dismiss signal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
