import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[var(--h-ctl)] w-full rounded-[var(--r-ctl)] border border-transparent bg-[var(--input)] px-2.5 py-1.5 [field-sizing:content]",
        "font-ui text-[var(--t-ui)] text-[var(--text)]",
        "placeholder:text-[var(--text-muted)]",
        "transition-[border-color,background-color] duration-[var(--t-base)] ease-[var(--ease)] focus-visible:border-[var(--line-strong)]",
        "disabled:cursor-not-allowed disabled:opacity-[.45]",
        "resize-y",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
