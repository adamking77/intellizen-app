import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Flat badge — 6px radius, uppercase 10px Switzer 600, tracking-[0.14em].
 * Tinted bg @ 15% + full-strength text color. No borders unless outline.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] font-ui select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]",
        accent:
          "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]",
        secondary:
          "bg-[var(--mantle)] text-[var(--subtext-0)]",
        neutral:
          "bg-[var(--mantle)] text-[var(--subtext-0)]",
        outline:
          "bg-transparent text-[var(--subtext-0)] border border-[var(--border)]",
        success:
          "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]",
        warning:
          "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]",
        info:
          "bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-[var(--info)]",
        destructive:
          "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
