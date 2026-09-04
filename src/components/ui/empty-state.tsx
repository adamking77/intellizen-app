import { Control } from "@/components/ui/control";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div className={cn("max-w-md py-6 text-left", className)} {...props}>
      <div className="text-[var(--t-ui)] font-medium text-[var(--text)]">{title}</div>
      {description ? <div className="mt-1 text-[var(--t-meta)] leading-5 text-[var(--text-muted)]">{description}</div> : null}
      {action ? <Control className="mt-3" variant="primary" onClick={action.onClick}>{action.label}</Control> : null}
    </div>
  );
}

interface FailureStateProps extends React.HTMLAttributes<HTMLDivElement> {
  message: string;
  action?: { label: string; onClick: () => void };
}

export function FailureState({ message, action, className, ...props }: FailureStateProps) {
  return (
    <div role="alert" className={cn("py-3 text-left text-[var(--t-meta)] text-[var(--bad)]", className)} {...props}>
      <span>{message}</span>
      {action ? <Control className="ml-2" size="sm" variant="danger" onClick={action.onClick}>{action.label}</Control> : null}
    </div>
  );
}
