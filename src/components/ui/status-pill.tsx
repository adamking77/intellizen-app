import { cn } from "@/lib/utils";

export type StatusPillVariant = "active" | "paused" | "error" | "stale" | "new";

interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: StatusPillVariant;
}

const styles: Record<StatusPillVariant, string> = {
  active:
    "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]",
  paused:
    "bg-[var(--mantle)] text-[var(--overlay-1)]",
  error:
    "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]",
  stale:
    "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]",
  new:
    "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]",
};

const labels: Record<StatusPillVariant, string> = {
  active: "ACTIVE",
  paused: "PAUSED",
  error: "ERROR",
  stale: "STALE",
  new: "NEW",
};

export function StatusPill({
  variant,
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] leading-none",
        styles[variant],
        className,
      )}
      {...props}
    >
      {children ?? labels[variant]}
    </span>
  );
}
