import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: 
          "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dim)] text-[var(--background)] font-semibold shadow-[0_0_0_1px_rgba(0,212,170,0.3),0_4px_12px_rgba(0,212,170,0.2)] hover:shadow-[0_0_0_1px_rgba(0,212,170,0.5),0_6px_20px_rgba(0,212,170,0.3)] hover:-translate-y-0.5",
        primary: 
          "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dim)] text-[var(--background)] font-semibold shadow-[0_0_0_1px_rgba(0,212,170,0.3),0_4px_12px_rgba(0,212,170,0.2)] hover:shadow-[0_0_0_1px_rgba(0,212,170,0.5),0_6px_20px_rgba(0,212,170,0.3)] hover:-translate-y-0.5",
        secondary:
          "bg-[var(--surface-strong)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[rgba(255,255,255,0.05)] hover:border-[var(--border-strong)]",
        ghost:
          "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[rgba(255,255,255,0.03)]",
        outline:
          "border border-[var(--border)] bg-transparent hover:bg-[var(--surface)] hover:border-[var(--border-strong)]",
        destructive:
          "bg-gradient-to-r from-[var(--danger)] to-[#dc2626] text-white shadow-[0_0_0_1px_rgba(239,68,68,0.3),0_4px_12px_rgba(239,68,68,0.2)]",
        glow: 
          "bg-[var(--surface)] border border-[var(--accent-border)] text-[var(--accent)] shadow-[0_0_20px_rgba(0,212,170,0.1)] hover:shadow-[0_0_30px_rgba(0,212,170,0.2)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
