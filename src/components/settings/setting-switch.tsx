import { cn } from "@/lib/utils";

export function SettingSwitch({
  on,
  label,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
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
        "relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)] disabled:opacity-40",
        on ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[3px] h-[14px] w-[14px] rounded-full bg-[var(--crust)] transition-[left]",
          on ? "left-[17px]" : "left-[3px]",
        )}
      />
    </button>
  );
}
