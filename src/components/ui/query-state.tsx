import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return typeof error === "string" ? error : "Something went wrong.";
}

interface QueryStateProps {
  isLoading: boolean;
  error?: unknown;
  isEmpty: boolean;
  children: ReactNode;
  onRetry?: () => void;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  errorTitle?: string;
  className?: string;
  loadingFallback?: ReactNode;
}

/**
 * Applies one predictable state order to async regions: error, loading, empty,
 * then content. Layout remains owned by the consuming surface.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  children,
  onRetry,
  loadingLabel = "Loading",
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  errorTitle = "Couldn’t load this content",
  className,
  loadingFallback,
}: QueryStateProps) {
  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          "rounded-xl border border-[color-mix(in_srgb,var(--danger)_42%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-5 py-4",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <div className="min-w-0 flex-1">
            <p className="font-ui text-[13px] font-semibold text-[var(--text)]">{errorTitle}</p>
            <p className="mt-1 break-words font-ui text-[12px] leading-5 text-[var(--subtext-0)]">
              {errorMessage(error)}
            </p>
            {onRetry ? (
              <Button className="mt-3 gap-1.5" size="sm" variant="secondary" onClick={onRetry}>
                <RotateCcw aria-hidden className="h-3 w-3" />
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return loadingFallback ?? (
      <div
        className={cn(
          "flex min-h-28 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-wash)] px-5 py-8",
          className,
        )}
      >
        <Loader2 aria-hidden className="h-4 w-4 animate-spin text-[var(--accent)]" />
        <span className="font-ui text-[12px] text-[var(--subtext-0)]">{loadingLabel}</span>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-5 py-8 text-center",
          className,
        )}
      >
        <p className="font-ui text-[13px] font-semibold text-[var(--text)]">{emptyTitle}</p>
        {emptyDescription ? (
          <p className="mx-auto mt-1 max-w-[440px] font-ui text-[12px] leading-5 text-[var(--subtext-0)]">
            {emptyDescription}
          </p>
        ) : null}
        {emptyAction ? <div className="mt-3 flex justify-center">{emptyAction}</div> : null}
      </div>
    );
  }

  return children;
}
