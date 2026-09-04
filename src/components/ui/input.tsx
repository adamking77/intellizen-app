import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-[var(--h-ctl)] w-full rounded-[var(--r-ctl)] border border-transparent bg-[var(--input)] px-2.5",
        "font-ui text-[var(--t-ui)] text-[var(--text)]",
        "placeholder:text-[var(--text-muted)]",
        "transition-[border-color,background-color] duration-[var(--t-base)] ease-[var(--ease)] focus-visible:border-[var(--line-strong)]",
        "disabled:cursor-not-allowed disabled:opacity-[.45]",
        className
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
