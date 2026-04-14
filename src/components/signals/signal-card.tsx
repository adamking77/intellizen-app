import { Bookmark, ExternalLink, X } from "lucide-react";

import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const DOMAIN_STYLES: Record<string, { dot: string; badge: string }> = {
  "Family Offices": {
    dot: "bg-[var(--accent)] shadow-[0_0_6px_rgba(0,212,170,0.7)]",
    badge: "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/25",
  },
  "SE Asia": {
    dot: "bg-[var(--info)] shadow-[0_0_6px_rgba(14,165,233,0.7)]",
    badge: "text-[var(--info)] bg-[var(--info)]/10 border-[var(--info)]/25",
  },
  "Spiritual Exploitation": {
    dot: "bg-[var(--warning)] shadow-[0_0_6px_rgba(245,158,11,0.7)]",
    badge: "text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/25",
  },
  "Crypto Fraud": {
    dot: "bg-[var(--danger)] shadow-[0_0_6px_rgba(239,68,68,0.7)]",
    badge: "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/25",
  },
  "Macro Political": {
    dot: "bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.7)]",
    badge: "text-violet-400 bg-violet-400/10 border-violet-400/25",
  },
  "Development Projects": {
    dot: "bg-[var(--success)] shadow-[0_0_6px_rgba(34,197,94,0.7)]",
    badge: "text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/25",
  },
  "Social & Cultural": {
    dot: "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]",
    badge: "text-rose-400 bg-rose-400/10 border-rose-400/25",
  },
  "Social / Cultural": {
    dot: "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]",
    badge: "text-rose-400 bg-rose-400/10 border-rose-400/25",
  },
};

const DEFAULT_STYLE = {
  dot: "bg-[var(--foreground-dim)]",
  badge: "text-[var(--foreground-muted)] bg-[var(--surface-strong)] border-[var(--border)]",
};

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
  const style = (watchDomain ? DOMAIN_STYLES[watchDomain] : null) ?? DEFAULT_STYLE;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group/row relative flex cursor-pointer items-center gap-3 border-b border-[var(--border)] px-4 py-3 transition-all duration-150",
        isActive
          ? "border-l-2 border-l-[var(--accent)] bg-[var(--accent)]/[0.06] pl-[14px]"
          : "border-l-2 border-l-transparent pl-[14px] hover:bg-white/[0.018]"
      )}
    >
      {/* Domain dot */}
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />

      {/* Domain badge */}
      {watchDomain ? (
        <span
          className={cn(
            "hidden shrink-0 rounded-full border px-2 py-px text-[9px] font-bold uppercase tracking-wider sm:inline-block",
            style.badge
          )}
        >
          {watchDomain.split(" ").slice(0, 2).join(" ")}
        </span>
      ) : null}

      {/* Title */}
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-[13px] font-medium leading-snug transition-colors duration-100",
          isActive
            ? "text-[var(--foreground)]"
            : "text-[var(--foreground-muted)] group-hover/row:text-[var(--foreground)]"
        )}
      >
        {title}
      </p>

      {/* Meta */}
      <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-[var(--foreground-dim)]">
        {source ? (
          <span className="hidden max-w-[120px] truncate lg:block">{source}</span>
        ) : null}
        {typeof score === "number" ? (
          <span
            className={cn(
              "font-mono font-semibold",
              score > 0.7
                ? "text-[var(--accent)]"
                : score > 0.5
                  ? "text-[var(--warning)]"
                  : "text-[var(--foreground-dim)]"
            )}
          >
            {score.toFixed(2)}
          </span>
        ) : null}
        <span className="hidden md:block">{formatDate(publishedAt)}</span>
      </div>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--foreground-dim)] hover:bg-white/[0.06] hover:text-[var(--foreground)]"
          title="Open URL"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {onSave ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--foreground-dim)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
            title="Save to project"
          >
            <Bookmark className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onDismiss ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--foreground-dim)] hover:bg-white/[0.06] hover:text-[var(--foreground-muted)]"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
