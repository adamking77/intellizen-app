import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-[var(--h-ctl)] w-full rounded-none border-0 border-b border-[var(--surface-line)] bg-transparent px-2.5",
        "font-ui text-[length:var(--t-ui)] text-[var(--text)]",
        "placeholder:text-[var(--text-muted)]",
        "transition-colors duration-[var(--t-base)] ease-[var(--ease)] focus-visible:border-[var(--accent)]",
        "disabled:cursor-not-allowed disabled:opacity-[.45]",
        className
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
