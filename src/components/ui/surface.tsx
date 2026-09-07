import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export type SurfaceProps = React.HTMLAttributes<HTMLDivElement>;

/** The one opaque floating surface used by new 2050 material. */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--r-surface)] bg-[var(--surface)] px-4 py-3",
        className,
      )}
      {...props}
    />
  ),
);

Surface.displayName = "Surface";
