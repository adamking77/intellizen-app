import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  className,
  checked,
  indeterminate = false,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.indeterminate = indeterminate && !checked;
  }, [checked, indeterminate]);

  return (
    <span className={cn("shared-checkbox relative inline-flex shrink-0 items-center", props.disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input
        ref={inputRef}
        type="checkbox"
        className="peer absolute inset-0 m-0 h-full w-full cursor-inherit opacity-0"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      <div
        className={cn(
          "pointer-events-none h-4 w-4 rounded-[var(--r-ctl)] border inline-flex items-center justify-center peer-disabled:opacity-[.45]",
          "transition-[background-color,border-color] duration-[var(--t-base)] ease-[var(--ease)]",
          checked
            ? "border-transparent bg-[var(--accent)]"
            : indeterminate
              ? "border-transparent bg-[color-mix(in_srgb,var(--accent)_22%,var(--mantle)_78%)]"
              : "border-[var(--surface-1)] bg-[var(--mantle)] peer-hover:border-[var(--line-strong)]"
        )}
      >
        {checked ? <Check aria-hidden className="h-3 w-3 text-[var(--accent-fg)]" /> : null}
        {!checked && indeterminate ? <div className="h-[2px] w-2 rounded-[var(--r-pill)] bg-[var(--accent)]" /> : null}
      </div>
    </span>
  );
}
