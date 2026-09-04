import { cn } from "@/lib/utils";

type ToolState = "running" | "verified" | "failure";

const dot: Record<ToolState, string> = {
  running: "var(--text-muted)",
  verified: "var(--ok)",
  failure: "var(--bad)",
};

interface ToolRowProps extends React.HTMLAttributes<HTMLDivElement> {
  tool: string;
  detail?: string;
  duration?: string;
  state?: ToolState;
}

export function ToolRow({ tool, detail, duration, state = "running", className, ...props }: ToolRowProps) {
  return (
    <div className={cn("flex min-h-[var(--h-row)] items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]", className)} {...props}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-[var(--r-pill)]" style={{ background: dot[state] }} />
      <span className="text-[var(--text)]">{tool}</span>
      {detail ? <><span>·</span><span className="truncate">{detail}</span></> : null}
      {duration ? <><span>·</span><span>{duration}</span></> : null}
    </div>
  );
}

interface ReceiptProps extends React.HTMLAttributes<HTMLDivElement> {
  verb: "wrote" | "moved" | "asked" | "linked" | string;
  object: string;
}

export function Receipt({ verb, object, className, ...props }: ReceiptProps) {
  return (
    <div className={cn("ml-3.5 flex min-h-[var(--h-row)] items-center gap-1.5 font-mono text-[11px]", className)} {...props}>
      <span className="text-[var(--text-muted)]">{verb}</span>
      <span className="truncate text-[var(--overlay-1)]">{object}</span>
    </div>
  );
}
