import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  waiting?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ selected, waiting, className, ...props }, ref) => (
    <div
      ref={ref}
      data-selected={selected || undefined}
      data-waiting={waiting || undefined}
      className={cn(
        "rounded-[var(--r-surface)] bg-[var(--surface)] px-[11px] py-[9px] text-[var(--text)] transition-colors duration-[var(--t-base)] ease-[var(--ease-out)] hover:bg-[color-mix(in_srgb,var(--surface),var(--text)_5%)]",
        selected && "bg-[var(--selected)] hover:bg-[var(--selected-hover)]",
        className,
      )}
      {...props}
    />
  ),
);

Card.displayName = "Card";
