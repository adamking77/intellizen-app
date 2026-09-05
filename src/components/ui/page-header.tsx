import type { ReactNode } from "react";

interface PageHeaderProps {
  title?: string;
  breadcrumb?: string;
  state?: ReactNode;
  waiting?: ReactNode;
  views?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, breadcrumb, state, waiting, views, action }: PageHeaderProps) {
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {title || breadcrumb ? <div className="min-w-0 basis-full">
        {breadcrumb ? <div className="truncate text-[var(--t-count)] text-[var(--text-muted)]">{breadcrumb}</div> : null}
        {title ? <h1 className="break-words font-ui text-[var(--t-title)] font-light uppercase tracking-[0.16em] text-[var(--text)]">{title}</h1> : null}
      </div> : null}
      {state ? <div className="min-w-0 flex-1 break-words text-[var(--t-meta)] text-[var(--text-muted)]">{state}</div> : null}
      {waiting ? <div className="text-[var(--t-meta)] text-[var(--wait)]">{waiting}</div> : null}
      {views ? <div className="min-w-0 max-w-full overflow-x-auto">{views}</div> : null}
      {action}
    </header>
  );
}
