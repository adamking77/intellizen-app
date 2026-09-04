import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

export function Skeleton({ lines = 3, className, ...props }: SkeletonProps) {
  return (
    <div className={cn("grid gap-2", className)} aria-busy="true" aria-label="Loading" {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="skeleton-line block h-[var(--h-row)] rounded-[var(--r-ctl)] bg-[var(--raised)]"
          style={{ width: index === lines - 1 ? "72%" : "100%" }}
        />
      ))}
    </div>
  );
}
