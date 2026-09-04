import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
          "py-3 text-left text-[var(--bad)]",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">{errorTitle}</p>
            <p className="mt-1 break-words font-ui text-[var(--t-meta)] leading-5 text-[var(--subtext-0)]">
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
          "min-h-28 px-5 py-8",
          className,
        )}
      >
        <span className="sr-only">{loadingLabel}</span>
        <Skeleton />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className={cn(
          "px-5 py-8 text-left",
          className,
        )}
      >
        <p className="font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">{emptyTitle}</p>
        {emptyDescription ? (
          <p className="mt-1 max-w-[440px] font-ui text-[var(--t-meta)] leading-5 text-[var(--subtext-0)]">
            {emptyDescription}
          </p>
        ) : null}
        {emptyAction ? <div className="mt-3">{emptyAction}</div> : null}
      </div>
    );
  }

  return children;
}
