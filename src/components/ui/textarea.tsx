import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[var(--h-ctl)] w-full rounded-none border-0 border-b border-[var(--surface-line)] bg-transparent px-2.5 py-1.5 [field-sizing:content]",
        "font-ui text-[length:var(--t-ui)] text-[var(--text)]",
        "placeholder:text-[var(--text-muted)]",
        "transition-colors duration-[var(--t-base)] ease-[var(--ease)] focus-visible:border-[var(--accent)]",
        "disabled:cursor-not-allowed disabled:opacity-[.45]",
        "resize-y",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
