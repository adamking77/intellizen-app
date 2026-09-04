import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  breadcrumb?: string;
  state?: ReactNode;
  waiting?: ReactNode;
  views?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, breadcrumb, state, waiting, views, action }: PageHeaderProps) {
  return (
    <header className="flex min-h-[var(--h-line)] items-center gap-3">
      <div className="min-w-0 flex-1">
        {breadcrumb ? <div className="truncate text-[var(--t-count)] text-[var(--text-muted)]">{breadcrumb}</div> : null}
        <h1 className="truncate font-ui text-[var(--t-section)] uppercase tracking-[0.14em] text-[var(--text)]">{title}</h1>
      </div>
      {state ? <div className="text-[var(--t-meta)] text-[var(--text-muted)]">{state}</div> : null}
      {waiting ? <div className="text-[var(--t-meta)] text-[var(--wait)]">{waiting}</div> : null}
      {views}
      {action}
    </header>
  );
}
