import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const controlVariants = cva(
  "inline-flex h-[var(--h-ctl)] items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--r-ctl)] " +
    "font-ui text-[12.5px] font-normal text-[var(--text)] transition-[background-color,box-shadow,color,opacity] " +
    "duration-[var(--t-base)] ease-[var(--ease)] disabled:pointer-events-none disabled:opacity-[.45] disabled:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-[var(--raised)] hover:shadow-[inset_0_0_0_999px_var(--hover)]",
        selected: "bg-[var(--selected)] font-[450] hover:bg-[var(--selected-hover)]",
        primary: "bg-[var(--go-bg)] text-[var(--go-fg)] hover:bg-[var(--go-hover)]",
        quiet: "bg-transparent text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
        danger:
          "bg-[color-mix(in_srgb,var(--bad)_18%,transparent)] text-[var(--bad)] hover:shadow-[inset_0_0_0_999px_var(--hover)]",
      },
      size: {
        default: "px-3",
        sm: "px-2.5",
        icon: "w-[var(--h-ctl)] px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ControlProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof controlVariants> {
  loading?: boolean;
}

export const Control = forwardRef<HTMLButtonElement, ControlProps>(
  ({ children, className, disabled, loading = false, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(controlVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span aria-hidden className="control-running-dot" /> : null}
      {children}
    </button>
  ),
);

Control.displayName = "Control";
