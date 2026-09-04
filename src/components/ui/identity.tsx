import { Pill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

interface IdentityProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  runtime?: string;
  model?: string;
  hue?: string;
  kind?: "hermes" | "acp" | "you";
}

export function Identity({ name, runtime, model, hue, kind = "hermes", className, ...props }: IdentityProps) {
  const initial = kind === "you" ? "Y" : name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} {...props}>
      <span
        aria-hidden
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[9px] font-medium text-[var(--crust)]"
        style={{ background: hue ?? "var(--accent)" }}
      >
        {initial}
      </span>
      <span className="truncate text-[var(--t-meta)] text-[var(--text)]">{name}</span>
      {runtime ? <Pill variant="runtime">{runtime}{kind === "acp" && model ? ` · ${model}` : ""}</Pill> : null}
    </span>
  );
}
