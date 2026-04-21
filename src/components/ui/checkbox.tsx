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
    <label className={cn("relative inline-flex items-center cursor-pointer", className)}>
      <input
        ref={inputRef}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      <div
        className={cn(
          "h-4 w-4 rounded-[4px] border inline-flex items-center justify-center",
          "transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
          checked
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : indeterminate
              ? "bg-[color-mix(in_srgb,var(--accent)_22%,var(--mantle)_78%)] border-[var(--accent-border)]"
              : "bg-[var(--mantle)] border-[var(--surface-1)] hover:border-[var(--accent)]"
        )}
      >
        {checked ? <Check className="h-3 w-3 text-[var(--crust)]" strokeWidth={3} /> : null}
        {!checked && indeterminate ? <div className="h-[2px] w-2 rounded-full bg-[var(--accent)]" /> : null}
      </div>
    </label>
  );
}
