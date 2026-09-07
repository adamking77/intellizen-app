import { cn } from "@/lib/utils";

/** The short, source-backed read of what the workspace is doing. */
export function Sentence({
  children,
  counts,
  className,
}: {
  children: React.ReactNode;
  counts?: string;
  className?: string;
}) {
  return (
    <p tabIndex={counts ? 0 : undefined} className={cn("group max-w-[760px] font-ui text-[clamp(20px,3vw,26px)] font-light leading-[1.3] text-[var(--text)] focus:outline-none", className)}>
      {children}
      {counts ? <><span className="ml-2 font-mono text-[length:var(--t-count)] text-[var(--text-dim)] opacity-0 transition-opacity duration-[var(--t-base)] group-hover:opacity-100 group-focus:opacity-100">{counts}</span><span className="sr-only"> {counts}</span></> : null}
    </p>
  );
}
