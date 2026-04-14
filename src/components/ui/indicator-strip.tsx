import { cn } from "@/lib/utils";

export type IndicatorStatus = "active" | "warning" | "danger" | "accent" | "neutral";

export interface IndicatorItem {
  label: string;
  value: string | number;
  status?: IndicatorStatus;
}

interface IndicatorStripProps extends React.HTMLAttributes<HTMLDivElement> {
  items: IndicatorItem[];
}

const dotColor: Record<IndicatorStatus, string> = {
  active: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  accent: "var(--accent)",
  neutral: "var(--overlay-1)",
};

/**
 * Horizontal LED-style readout row. Each cell: 10px uppercase label above
 * Geist Mono 12px value. Optional 2px status dot.
 */
export function IndicatorStrip({ items, className, ...props }: IndicatorStripProps) {
  return (
    <div
      className={cn(
        "inline-flex items-stretch divide-x divide-[var(--border-subtle)]",
        className,
      )}
      {...props}
    >
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-1 px-4 first:pl-0 last:pr-0">
          <span className="text-label">{item.label}</span>
          <div className="flex items-center gap-1.5">
            {item.status && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: dotColor[item.status] }}
              />
            )}
            <span className="font-mono text-[12px] text-[var(--text)] leading-none">
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
