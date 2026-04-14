import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-lg border border-[var(--border)] bg-[var(--mantle)] px-3 py-2.5",
        "font-ui text-[13px] text-[var(--text)]",
        "placeholder:text-[var(--overlay-0)]",
        "transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_1px_var(--accent-border)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-y",
        className
      )}
      {...props}
    />
  );
}
