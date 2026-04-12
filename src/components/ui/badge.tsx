import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        neutral:
          "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]",
        accent:
          "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
        success:
          "border-[rgba(82,184,132,0.4)] bg-[rgba(82,184,132,0.12)] text-[#8cf0b7]",
        warning:
          "border-[rgba(241,193,86,0.4)] bg-[rgba(241,193,86,0.12)] text-[#f1d27a]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
