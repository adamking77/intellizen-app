import { cn } from "@/lib/utils";

export type SaveStateValue = "idle" | "dirty" | "saving" | "saved" | "error";

interface SaveStateProps {
  state: SaveStateValue;
  onRetry?: () => void;
  className?: string;
}

const STATE_LABELS: Record<Exclude<SaveStateValue, "idle">, string> = {
  dirty: "Editing…",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

export function SaveState({ state, onRetry, className }: SaveStateProps) {
  if (state === "idle") return null;

  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center gap-2 font-mono text-[10px]",
        state === "saved"
          ? "text-[var(--success)]"
          : state === "error"
            ? "text-[var(--danger)]"
            : "text-[var(--overlay-1)]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span>{STATE_LABELS[state]}</span>
      {state === "error" && onRetry ? (
        <button
          type="button"
          className="rounded-full px-2 py-0.5 font-ui font-medium text-[var(--accent)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </span>
  );
}
