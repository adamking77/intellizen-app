import type { HTMLAttributes } from "react";

import { getReadableTextColor } from "@/lib/database-colors";
import { cn } from "@/lib/utils";

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  color?: string | null;
}

export function Badge({ className, color, style, ...props }: BadgeProps) {
  const backgroundColor = color ?? "var(--surface-wash-strong)";
  const textColor = color ? getReadableTextColor(color) : "var(--subtext-0)";

  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center rounded-full px-2 py-0.5 text-[12px] font-medium leading-none",
        className,
      )}
      style={{
        backgroundColor,
        color: textColor,
        ...style,
      }}
      {...props}
    />
  );
}
