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
        size === "compact" ? "h-[19px] w-8" : "h-[22px] w-[38px]",
        on
          ? "bg-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
          : "bg-[color-mix(in_srgb,var(--text)_14%,transparent)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[2px] h-[18px] w-[18px] rounded-[var(--r-pill)] transition-[left,background-color]",
          size === "compact" && "top-[2px] h-[15px] w-[15px]",
          size === "compact" ? (on ? "left-[15px]" : "left-[2px]") : (on ? "left-[18px]" : "left-[2px]"),
          on ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]",
        )}
      />
    </button>
  );
}
