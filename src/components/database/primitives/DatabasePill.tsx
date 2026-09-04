import type { HTMLAttributes } from "react";

import { Pill } from "@/components/ui/status-pill";
import { getReadableTextColor } from "@/lib/database-colors";

interface DatabasePillProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  color?: string | null;
}

export function DatabasePill({ color, style, ...props }: DatabasePillProps) {
  return (
    <Pill
      style={{
        backgroundColor: color ?? "var(--surface-wash-strong)",
        color: color ? getReadableTextColor(color) : "var(--subtext-0)",
        ...style,
      }}
      {...props}
    />
  );
}
