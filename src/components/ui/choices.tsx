import { useRef } from "react";

import { Control } from "@/components/ui/control";
import { cn } from "@/lib/utils";

export interface Choice {
  id: string;
  label: string;
  recommended?: boolean;
  quiet?: boolean;
  disabled?: boolean;
}

function editableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function Choices({
  choices,
  onChoose,
  label = "Choices",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  choices: Choice[];
  onChoose: (id: string) => void;
  label?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap gap-x-4 gap-y-2", className)}
      onKeyDown={(event) => {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.repeat ||
          event.nativeEvent.isComposing ||
          editableTarget(event.target) ||
          !root.current?.contains(document.activeElement)
        ) return;
        const index = Number(event.key) - 1;
        const choice = Number.isInteger(index) ? choices[index] : undefined;
        if (!choice || choice.disabled) return;
        event.preventDefault();
        onChoose(choice.id);
      }}
      {...props}
    >
      {choices.map((choice) => (
        <Control
          key={choice.id}
          size="sm"
          variant="text"
          disabled={choice.disabled}
          onClick={() => onChoose(choice.id)}
          className={cn(choice.quiet && "text-[var(--text-dim)]")}
        >
          {choice.label}
          {choice.recommended ? <span className="font-mono text-[var(--t-count)] text-[var(--text-dim)]"> · recommended</span> : null}
        </Control>
      ))}
    </div>
  );
}
