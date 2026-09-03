import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface CollapsedRailTriggerProps {
  visible: boolean;
  onExpand: () => void;
  label: string;
  className?: string;
}

export function CollapsedRailTrigger({
  visible,
  onExpand,
  label,
  className,
}: CollapsedRailTriggerProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={label}
      title={label}
      className={cn(
        "absolute left-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-pill)]",
        "border border-[var(--border)] bg-[var(--mantle)] text-[var(--overlay-1)]",
        "transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        className,
      )}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}
