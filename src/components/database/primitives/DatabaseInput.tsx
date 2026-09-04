import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface DatabaseInputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const DatabaseInput = forwardRef<HTMLInputElement, DatabaseInputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--mantle)] px-3 py-2",
        "font-ui text-[13px] text-[var(--text)] placeholder:text-[var(--overlay-0)]",
        "transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "focus:border-[var(--accent)] focus:outline-none focus:shadow-[0_0_0_1px_var(--accent-border)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);

DatabaseInput.displayName = "DatabaseInput";
