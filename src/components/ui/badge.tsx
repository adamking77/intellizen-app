import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: 
          "border-transparent bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20",
        secondary:
          "border-transparent bg-[var(--surface-strong)] text-[var(--foreground-muted)] border border-[var(--border)]",
        destructive:
          "border-transparent bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20",
        outline: 
          "text-[var(--foreground-muted)] border-[var(--border)]",
        success:
          "border-transparent bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20",
        warning:
          "border-transparent bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20",
        info:
          "border-transparent bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20",
        glow:
          "border-transparent bg-[var(--accent)]/5 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_10px_rgba(0,212,170,0.1)]",
        accent:
          "border-transparent bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20",
        neutral:
          "border-transparent bg-[var(--surface-strong)] text-[var(--foreground-muted)] border border-[var(--border)]",
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
