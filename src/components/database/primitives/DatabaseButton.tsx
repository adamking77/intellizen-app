import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const databaseButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-pill)] font-medium font-ui select-none " +
    "transition-[background-color,border-color,color,opacity] duration-[var(--t-base)] ease-[var(--ease)] " +
    "disabled:pointer-events-none disabled:opacity-50 focus-visible:shadow-none",
  {
    variants: {
      variant: {
        primary: "bg-[var(--accent)] text-[var(--crust)] hover:bg-[var(--accent-hover)]",
        secondary: "border border-[var(--border)] bg-[var(--mantle)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--base)]",
        outline: "border border-[var(--border)] bg-transparent text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
        ghost: "border border-transparent bg-transparent text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        selected: "border border-transparent bg-[var(--selected)] text-[var(--text)] hover:bg-[var(--selected-hover)]",
        destructive: "bg-[var(--danger)] text-[var(--crust)] hover:opacity-90",
        "accent-soft": "border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]",
        "accent-outline": "border border-[var(--accent-border)] bg-transparent text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
      },
      size: {
        default: "h-9 px-4 text-[var(--t-ui)]",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface DatabaseButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof databaseButtonVariants> {}

export const DatabaseButton = forwardRef<HTMLButtonElement, DatabaseButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(databaseButtonVariants({ variant, size, className }))} {...props} />
  ),
);

DatabaseButton.displayName = "DatabaseButton";
