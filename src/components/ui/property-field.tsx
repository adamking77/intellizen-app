import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PropertyFieldProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function PropertyField({ label, htmlFor, children, hint, className }: PropertyFieldProps) {
  const labelClassName = "pt-2 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]";

  return (
    <div className={cn("grid grid-cols-[92px_minmax(0,1fr)] gap-3", className)}>
      {htmlFor ? (
        <label className={labelClassName} htmlFor={htmlFor}>{label}</label>
      ) : (
        <span className={labelClassName}>{label}</span>
      )}
      <div className="min-w-0">
        {children}
        {hint ? <p className="mt-1.5 text-meta">{hint}</p> : null}
      </div>
    </div>
  );
}
