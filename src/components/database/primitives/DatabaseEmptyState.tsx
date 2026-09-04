import { DatabaseButton } from "@/components/database/primitives/DatabaseButton";

interface DatabaseEmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function DatabaseEmptyState({ title, description, action }: DatabaseEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-[var(--r-plane)] border border-dashed border-[var(--border)] bg-[var(--mantle)] px-6 py-10 text-center">
        <div className="text-[var(--t-title)] font-semibold text-[var(--text)]">{title}</div>
        {description ? <div className="mt-2 text-[var(--t-ui)] leading-6 text-[var(--subtext-0)]">{description}</div> : null}
        {action ? <div className="mt-4 flex justify-center"><DatabaseButton onClick={action.onClick}>{action.label}</DatabaseButton></div> : null}
      </div>
    </div>
  );
}
