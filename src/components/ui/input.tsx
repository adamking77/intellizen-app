import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[var(--r-plane)] border border-[var(--border)] bg-[var(--mantle)] px-3 py-2",
        "font-ui text-[var(--t-ui)] text-[var(--text)]",
        "placeholder:text-[var(--overlay-0)]",
        "transition-[border-color,background-color] duration-[var(--t-base)] ease-[var(--ease)]",
        "focus:outline-none focus:shadow-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
