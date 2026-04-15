import { cn } from "@/lib/utils";

export type IndicatorStatus = "active" | "warning" | "danger" | "accent" | "neutral";

export interface IndicatorItem {
  label: string;
  value: string | number;
  status?: IndicatorStatus;
  onClick?: () => void;
  active?: boolean;
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
 * Geist Mono 12px value. Optional 2px status dot. Items with `onClick` render
 * as buttons with `active` highlighting.
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
      {items.map((item, i) => {
        const isButton = typeof item.onClick === "function";
        const content = (
          <>
            <span
              className={cn(
                "text-label",
                isButton && "transition-colors",
                item.active && "text-[var(--accent)]",
              )}
            >
              {item.label}
            </span>
            <div className="flex items-center gap-1.5">
              {item.status && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: dotColor[item.status] }}
                />
              )}
              <span
                className={cn(
                  "font-mono text-[12px] leading-none transition-colors",
                  item.active ? "text-[var(--accent)]" : "text-[var(--text)]",
                )}
              >
                {item.value}
              </span>
            </div>
          </>
        );

        if (isButton) {
          return (
            <button
              key={i}
              type="button"
              onClick={item.onClick}
              data-active={item.active ? "true" : undefined}
              className={cn(
                "group/indicator flex cursor-pointer flex-col gap-1 px-4 py-0.5 text-left transition-colors first:pl-0 last:pr-0",
                "hover:[&_.text-label]:text-[var(--text)] hover:[&_.font-mono]:text-[var(--text)]",
                item.active && "hover:[&_.text-label]:text-[var(--accent)] hover:[&_.font-mono]:text-[var(--accent)]",
              )}
            >
              {content}
            </button>
          );
        }

        return (
          <div key={i} className="flex flex-col gap-1 px-4 first:pl-0 last:pr-0">
            {content}
          </div>
        );
      })}
    </div>
  );
}
