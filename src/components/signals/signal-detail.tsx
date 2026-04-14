import { Bookmark, ExternalLink, Radar, Target, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { cn, formatDate, safeHostname } from "@/lib/utils";
import { domainColor } from "@/lib/domains";
import type { IntelSignal } from "@/lib/types";

type SignalDetailProps = {
  signal: IntelSignal | null;
  onSave: (signal: IntelSignal) => void;
  onAttach: (signal: IntelSignal) => void;
  onDismiss: (signalId: number) => void;
};

export function SignalDetail({ signal, onSave, onAttach, onDismiss }: SignalDetailProps) {
  if (!signal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Radar className="h-5 w-5 text-[var(--overlay-1)]" strokeWidth={1.5} />
        <div>
          <p className="text-label">No signal selected</p>
          <p className="mt-2 font-ui text-[12px] text-[var(--overlay-1)]">
            Select a signal from the feed
          </p>
        </div>
      </div>
    );
  }

  const color = domainColor(signal.watch_domain);
  const host = safeHostname(signal.url);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border)] p-5">
        <div className="mb-3 flex items-center gap-2">
          {signal.watch_domain ? (
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
              />
              <span
                className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color }}
              >
                {signal.watch_domain}
              </span>
            </div>
          ) : null}
          {typeof signal.exa_score === "number" ? (
            <span
              className={cn(
                "ml-auto font-mono text-[11px] tabular-nums",
                signal.exa_score > 0.7
                  ? "text-[var(--accent)]"
                  : signal.exa_score > 0.5
                    ? "text-[var(--warning)]"
                    : "text-[var(--overlay-1)]",
              )}
            >
              {signal.exa_score.toFixed(3)}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void openUrl(signal.url)}
          className="group/link inline-flex items-start gap-2 text-left"
        >
          <h2 className="font-ui text-[15px] font-semibold leading-snug text-[var(--text)] transition-colors duration-150 group-hover/link:text-[var(--accent)]">
            {signal.title}
          </h2>
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)] group-hover/link:text-[var(--accent)]" />
        </button>
      </div>

      {/* Meta row (mono) */}
      <div className="shrink-0 border-b border-[var(--border)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--overlay-1)]">
          {signal.source ? (
            <span className="text-[var(--subtext-0)]">{signal.source}</span>
          ) : null}
          <span>{formatDate(signal.published_at)}</span>
          {host && <span>{host}</span>}
        </div>
      </div>

      {/* Snippet */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {signal.snippet ? (
          <p className="font-ui text-[13px] leading-relaxed text-[var(--subtext-1)]">
            {signal.snippet}
          </p>
        ) : (
          <p className="font-ui text-[12px] italic text-[var(--overlay-1)]">
            No snippet available.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-[var(--border)] p-4">
        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={() => onSave(signal)}>
            <Bookmark className="h-3.5 w-3.5" />
            Save to project
          </Button>
          <Button variant="secondary" className="gap-2" onClick={() => onAttach(signal)}>
            <Target className="h-3.5 w-3.5" />
            Attach
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:text-[var(--danger)]"
            onClick={() => onDismiss(signal.id)}
            title="Dismiss signal"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
