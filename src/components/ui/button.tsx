import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-pill)] font-medium font-ui select-none " +
    "transition-[background-color,border-color,color,opacity] duration-[var(--t-base)] ease-[var(--ease)] " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:shadow-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[var(--crust)] hover:bg-[var(--accent-hover)]",
        secondary:
          "bg-[var(--mantle)] text-[var(--text)] border border-[var(--border)] " +
          "hover:border-[var(--border-strong)] hover:bg-[var(--base)]",
        outline:
          "bg-transparent text-[var(--text)] border border-[var(--border)] " +
          "hover:bg-[var(--surface-wash)] hover:border-[var(--border-strong)]",
        ghost:
          "bg-transparent text-[var(--subtext-0)] border border-transparent " +
          "hover:text-[var(--text)] hover:bg-[var(--surface-wash)]",
        selected:
          "bg-[var(--selected)] text-[var(--text)] border border-transparent hover:bg-[var(--selected-hover)]",
        destructive:
          "bg-[var(--danger)] text-[var(--crust)] hover:opacity-90",
        "accent-soft":
          "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] " +
          "hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]",
        "accent-outline":
          "bg-transparent text-[var(--accent)] border border-[var(--accent-border)] " +
          "hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]",
      },
      size: {
        default: "h-9 px-4 text-[var(--t-ui)]",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export { buttonVariants };
