import { Bookmark, ExternalLink, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { cn, formatDate, safeHostname } from "@/lib/utils";
import { domainColor } from "@/lib/domains";

type SignalCardProps = {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
  watchDomain?: string | null;
  snippet: string | null;
  score: number | null;
  isActive?: boolean;
  onClick?: () => void;
  onSave?: () => void;
  onDismiss?: () => void;
};

export function SignalCard({
  title,
  url,
  source,
  publishedAt,
  watchDomain,
  score,
  isActive,
  onClick,
  onSave,
  onDismiss,
}: SignalCardProps) {
  const color = domainColor(watchDomain);
  const host = safeHostname(url);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group/row relative flex cursor-pointer items-center gap-3 pl-4 pr-3 py-2.5",
        "border-b border-[var(--border-subtle)]",
        "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isActive
          ? "bg-[var(--accent-soft)]"
          : "hover:bg-[var(--surface-wash)]",
      )}
    >
      {/* Entity-hue left accent strip */}
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2"
        style={{ background: color }}
      />

      {/* Title */}
      <p
        className={cn(
          "min-w-0 flex-1 truncate font-ui text-[13px] leading-snug",
          isActive
            ? "text-[var(--text)] font-medium"
            : "text-[var(--subtext-1)] group-hover/row:text-[var(--text)]",
        )}
      >
        {title}
      </p>

      {/* Meta (mono) */}
      <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-[var(--overlay-1)] tabular-nums">
        {source ? (
          <span className="hidden max-w-[140px] truncate lg:block">{source}</span>
        ) : (
          host && <span className="hidden max-w-[140px] truncate lg:block">{host}</span>
        )}
        {typeof score === "number" ? (
          <span
            className={cn(
              score > 0.7
                ? "text-[var(--accent)]"
                : score > 0.5
                  ? "text-[var(--warning)]"
                  : "text-[var(--overlay-1)]",
            )}
          >
            {score.toFixed(2)}
          </span>
        ) : null}
        <span className="hidden md:block">{formatDate(publishedAt)}</span>
      </div>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void openUrl(url);
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          title="Open URL"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
        {onSave ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
            title="Save to project"
          >
            <Bookmark className="h-3 w-3" />
          </button>
        ) : null}
        {onDismiss ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--subtext-1)]"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
