import { Choices } from "@/components/ui/choices";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Surface } from "@/components/ui/surface";
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
    <Surface
      className={cn(
        "grid gap-3",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <Eyebrow tone="question">A question for you</Eyebrow>
        <div className="mt-1 text-[17px] font-light leading-[1.4] text-[var(--text)]">{question}</div>
        {why ? <div className="mt-0.5 break-words text-[var(--t-meta)] text-[var(--text-mid)]">{why}</div> : null}
      </div>
      <Choices choices={choices} onChoose={onChoose} label={question} />
    </Surface>
  );
}
