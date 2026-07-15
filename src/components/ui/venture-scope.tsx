import { ventureScopeLabel } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

export function VentureScope({ className }: { className?: string }) {
  const entityFilter = useAppStore((state) => state.entityFilter);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-[var(--border)] px-2.5 py-1 font-ui text-[11px] text-[var(--subtext-0)]",
        className,
      )}
      title="Current venture scope"
    >
      Venture · {ventureScopeLabel(entityFilter)}
    </span>
  );
}
