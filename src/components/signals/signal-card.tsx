import { Bookmark, Check, ExternalLink, X } from "lucide-react";
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
  isSelected?: boolean;
  selectionActive?: boolean;
  onClick?: () => void;
  onSave?: () => void;
  onDismiss?: () => void;
  onToggleSelect?: (event: React.MouseEvent) => void;
};

export function SignalCard({
  title,
  url,
  source,
  publishedAt,
  watchDomain,
  score,
  isActive,
  isSelected,
  selectionActive,
  onClick,
  onSave,
  onDismiss,
  onToggleSelect,
}: SignalCardProps) {
  const color = domainColor(watchDomain);
  const host = safeHostname(url);
  const showCheckbox = Boolean(onToggleSelect);
  const label = watchDomain ?? "Manual";

  return (
    <div
      onClick={onClick}
      data-selected={isSelected ? "true" : undefined}
      data-active={isActive ? "true" : undefined}
      className={cn(
        "group/row relative flex cursor-pointer items-start gap-3 pr-3 py-4",
        "border-b border-[var(--border-subtle)]",
        "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isSelected
          ? "bg-[var(--accent-soft)] pl-[13px]"
          : isActive
            ? "bg-[var(--surface-wash)] pl-4"
            : "pl-4 hover:bg-[var(--surface-wash)]",
      )}
    >
      {/* Selection rail */}
      {isSelected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]"
        />
      ) : null}

      {/* Active rail */}
      {!isSelected && isActive ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-2.5 left-0 w-[2px] bg-[var(--accent)]/60"
        />
      ) : null}

      {/* Selection checkbox — aligned to first text line */}
      {showCheckbox ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(e);
          }}
          aria-label={isSelected ? "Deselect signal" : "Select signal"}
          className={cn(
            "relative z-[1] mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-all duration-150",
            isSelected
              ? "border-[var(--accent)] bg-[var(--accent)] opacity-100"
              : selectionActive
                ? "border-[var(--border-strong)] bg-transparent opacity-100 hover:border-[var(--accent)]"
                : "border-[var(--border-strong)] bg-transparent opacity-0 group-hover/row:opacity-100 hover:border-[var(--accent)]",
          )}
        >
          {isSelected ? <Check className="h-2.5 w-2.5 text-[var(--base)]" strokeWidth={3} /> : null}
        </button>
      ) : null}

      {/* Stacked content column */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Title row with hover actions floated right */}
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 font-ui text-[13px] leading-snug line-clamp-2",
              isSelected || isActive
                ? "text-[var(--text)] font-medium"
                : "text-[var(--subtext-1)] group-hover/row:text-[var(--text)]",
            )}
          >
            {title}
          </p>

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

        {/* Meta row: topic chip · source · score · date */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="inline-flex shrink-0 items-center gap-1.5" title={label}>
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span
              className="font-ui text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color }}
            >
              {label}
            </span>
          </span>

          {source || host ? (
            <>
              <span aria-hidden className="text-[var(--overlay-0)]">·</span>
              <span className="min-w-0 truncate font-mono text-[11px] text-[var(--overlay-1)]">
                {source ?? host}
              </span>
            </>
          ) : null}

          {typeof score === "number" ? (
            <>
              <span aria-hidden className="text-[var(--overlay-0)]">·</span>
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  score > 0.7
                    ? "text-[var(--accent)]"
                    : score > 0.5
                      ? "text-[var(--warning)]"
                      : "text-[var(--overlay-1)]",
                )}
              >
                {score.toFixed(2)}
              </span>
            </>
          ) : null}

          {publishedAt ? (
            <>
              <span aria-hidden className="text-[var(--overlay-0)]">·</span>
              <span className="font-mono text-[11px] text-[var(--overlay-1)]">
                {formatDate(publishedAt)}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
