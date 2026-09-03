import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[100px] w-full rounded-[var(--r-plane)] border border-[var(--border)] bg-[var(--mantle)] px-3 py-2.5",
        "font-ui text-[var(--t-ui)] text-[var(--text)]",
        "placeholder:text-[var(--overlay-0)]",
        "transition-[border-color,background-color] duration-[var(--t-base)] ease-[var(--ease)]",
        "focus:outline-none focus:shadow-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-y",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
