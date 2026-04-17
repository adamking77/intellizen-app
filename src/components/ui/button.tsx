import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium font-ui select-none " +
    "transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] " +
    "active:scale-[0.98] " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[var(--crust)] hover:bg-[var(--accent-hover)]",
        default:
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
        destructive:
          "bg-[var(--danger)] text-white hover:bg-[#f56060]",
        glow:
          "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] " +
          "hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]",
      },
      size: {
        default: "h-9 px-3.5 text-[13px]",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-5 text-sm",
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

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
