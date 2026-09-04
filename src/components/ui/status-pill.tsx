import { cn } from "@/lib/utils";

export type PillVariant = "neutral" | "waiting" | "verified" | "failure" | "runtime";
export type StatusPillVariant = "active" | "paused" | "error" | "stale" | "new";

const pillStyles: Record<PillVariant, string> = {
  neutral: "bg-[var(--raised)] text-[var(--text-muted)]",
  waiting: "bg-[color-mix(in_srgb,var(--wait)_18%,transparent)] text-[var(--wait)]",
  verified: "bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]",
  failure: "bg-[color-mix(in_srgb,var(--bad)_18%,transparent)] text-[var(--bad)]",
  runtime: "bg-transparent text-[var(--runtime)]",
};

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
}

export function Pill({ variant = "neutral", className, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-4 items-center rounded-[var(--r-pill)] px-2 py-px font-ui text-[11px] leading-4",
        pillStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

const legacy: Record<StatusPillVariant, { variant: PillVariant; label: string }> = {
  active: { variant: "verified", label: "ACTIVE" },
  paused: { variant: "neutral", label: "PAUSED" },
  error: { variant: "failure", label: "ERROR" },
  stale: { variant: "waiting", label: "STALE" },
  new: { variant: "runtime", label: "NEW" },
};

interface StatusPillProps extends Omit<PillProps, "variant"> {
  variant: StatusPillVariant;
}

export function StatusPill({ variant, children, ...props }: StatusPillProps) {
  return <Pill variant={legacy[variant].variant} {...props}>{children ?? legacy[variant].label}</Pill>;
}
