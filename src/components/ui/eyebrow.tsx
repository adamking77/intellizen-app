import { cn } from "@/lib/utils";

export function Eyebrow({
  children,
  tone = "dim",
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "dim" | "question" | "agent";
}) {
  return (
    <span
      className={cn(
        "font-mono text-[var(--t-count)] font-normal uppercase tracking-[0.14em]",
        tone === "question" ? "text-[var(--question)]" : tone === "agent" ? "" : "text-[var(--text-dim)]",
        className,
      )}
      style={tone === "agent" ? { ...style, color: "var(--agent-color, var(--text-dim))" } : style}
      {...props}
    >
      {children}
    </span>
  );
}
