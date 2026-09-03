import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-[var(--r-plane)] border border-dashed border-[var(--border)] bg-[var(--mantle)] px-6 py-10 text-center">
        <div className="text-[var(--t-title)] font-semibold text-[var(--text)]">{title}</div>
        {description ? (
          <div className="mt-2 text-[var(--t-ui)] leading-6 text-[var(--subtext-0)]">{description}</div>
        ) : null}
        {action ? (
          <div className="mt-4 flex justify-center">
            <Button onClick={action.onClick}>{action.label}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
