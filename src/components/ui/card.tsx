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
      className={cn(
        "rounded-[var(--r-ctl)] bg-[var(--raised)] px-[11px] py-[9px] text-[var(--text)] transition-[background-color,box-shadow] duration-[var(--t-base)] ease-[var(--ease)] hover:shadow-[inset_0_0_0_999px_var(--hover)]",
        selected && "bg-[var(--selected)] hover:bg-[var(--selected-hover)] hover:shadow-none",
        waiting && "bg-[color-mix(in_srgb,var(--wait)_10%,var(--raised))]",
        className,
      )}
      {...props}
    />
  ),
);

Card.displayName = "Card";
