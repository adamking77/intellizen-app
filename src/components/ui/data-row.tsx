import { cn } from "@/lib/utils";
import type { IndicatorStatus } from "./indicator-strip";

interface DataRowProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: IndicatorStatus | string;
  active?: boolean;
}

const accentColor = (accent?: string): string | undefined => {
  if (!accent) return undefined;
  if (accent.startsWith("var(") || accent.startsWith("#") || accent.startsWith("rgb")) {
    return accent;
  }
  const map: Record<string, string> = {
    active: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    accent: "var(--accent)",
    neutral: "var(--overlay-1)",
  };
  return map[accent];
};

/**
 * Divider-separated data row, no card. 2px accent strip on the left
 * (status color or entity hue), data cells in the body.
 */
export function DataRow({
  className,
  accent,
  active,
  style,
  children,
  ...props
}: DataRowProps) {
  const color = accentColor(accent);
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 px-4 py-3 cursor-pointer",
        "border-b border-[var(--border-subtle)]",
        "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:bg-[var(--surface-wash)]",
        active && "bg-[var(--accent-soft)]",
        className,
      )}
      style={style}
      {...props}
    >
      {color && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2"
          style={{ background: color }}
        />
      )}
      {children}
    </div>
  );
}
