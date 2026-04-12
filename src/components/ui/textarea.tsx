import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]",
        "placeholder:text-[var(--foreground-dim)]",
        "focus:outline-none focus:border-[var(--accent-border)] focus:ring-3 focus:ring-[var(--accent-soft)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-y",
        "transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}
