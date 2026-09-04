import { Control } from "@/components/ui/control";
import { cn } from "@/lib/utils";

export interface DecisionChoice {
  id: string;
  label: string;
  recommended?: boolean;
  disabled?: boolean;
}

interface DecisionFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  question: string;
  why?: string;
  choices: DecisionChoice[];
  onChoose: (id: string) => void;
}

export function DecisionField({ question, why, choices, onChoose, className, ...props }: DecisionFieldProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--r-ctl)] bg-[color-mix(in_srgb,var(--wait)_10%,transparent)] px-[13px] py-[11px]",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <div className="font-ui text-[var(--t-count)] uppercase tracking-[0.14em] text-[var(--wait)]">Waiting on you</div>
        <div className="mt-1 text-[var(--t-ui)] font-medium text-[var(--text)]">{question}</div>
        {why ? <div className="mt-0.5 truncate text-[var(--t-meta)] text-[var(--text-muted)]">{why}</div> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        {choices.map((choice) => (
          <Control
            key={choice.id}
            size="sm"
            variant={choice.recommended ? "primary" : "default"}
            disabled={choice.disabled}
            onClick={() => onChoose(choice.id)}
          >
            {choice.label}
          </Control>
        ))}
      </div>
    </div>
  );
}
