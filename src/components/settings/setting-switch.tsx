import { cn } from "@/lib/utils";

export function SettingSwitch({
  on,
  label,
  disabled,
  size = "regular",
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  size?: "compact" | "regular";
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative shrink-0 rounded-[var(--r-pill)] transition-colors disabled:opacity-40",
        size === "compact" ? "h-[var(--h-ctl)] w-9" : "h-[var(--h-ctl)] w-10",
        on
          ? "bg-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
          : "bg-[color-mix(in_srgb,var(--text)_14%,transparent)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-[var(--r-pill)] transition-[left,background-color]",
          size === "compact" && "h-[15px] w-[15px]",
          size === "compact" ? (on ? "left-[19px]" : "left-[2px]") : (on ? "left-[20px]" : "left-[2px]"),
          on ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]",
        )}
      />
    </button>
  );
}
