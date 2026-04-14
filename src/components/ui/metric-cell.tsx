import { cn } from "@/lib/utils";

interface MetricCellProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  delta?: { value: string | number; direction: "up" | "down" | "flat" };
}

export function MetricCell({
  label,
  value,
  delta,
  className,
  ...props
}: MetricCellProps) {
  const deltaColor =
    delta?.direction === "up"
      ? "var(--success)"
      : delta?.direction === "down"
        ? "var(--danger)"
        : "var(--overlay-1)";
  const arrow =
    delta?.direction === "up" ? "▲" : delta?.direction === "down" ? "▼" : "–";

  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      <span className="text-label">{label}</span>
      <span className="text-metric leading-none">{value}</span>
      {delta && (
        <span
          className="font-mono text-[11px] leading-none"
          style={{ color: deltaColor }}
        >
          {arrow} {delta.value}
        </span>
      )}
    </div>
  );
}
