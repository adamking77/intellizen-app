import { useId, useRef } from "react";

import { Control } from "@/components/ui/control";
import { cn } from "@/lib/utils";
import { runViewTransition, type ViewTransitionKind } from "@/lib/view-transitions";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  label: string;
  kind?: "tabs" | "choice";
  transitionKind?: ViewTransitionKind;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onValueChange,
  label,
  kind = "tabs",
  transitionKind = "segment",
  className,
}: SegmentedProps<T>) {
  const controls = useRef<(HTMLButtonElement | null)[]>([]);
  const transitionName = `segmented-${useId().replaceAll(":", "")}`;

  function select(next: T) {
    runViewTransition(transitionKind, () => onValueChange(next));
  }

  function move(from: number, direction: -1 | 1 | "first" | "last") {
    const enabled = options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled);
    if (!enabled.length) return;
    const current = enabled.findIndex(({ index }) => index === from);
    const target = direction === "first"
      ? enabled[0]
      : direction === "last"
        ? enabled.at(-1)!
        : enabled[(current + direction + enabled.length) % enabled.length];
    select(target.option.value);
    controls.current[target.index]?.focus();
  }

  return (
    <div
      role={kind === "tabs" ? "tablist" : "radiogroup"}
      aria-label={label}
      className={cn("inline-flex h-[var(--h-ctl)] gap-0.5 rounded-[var(--r-ctl)] bg-[var(--crust)] p-0.5", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Control
            key={option.value}
            ref={(node) => { controls.current[index] = node; }}
            role={kind === "tabs" ? "tab" : "radio"}
            aria-selected={kind === "tabs" ? selected : undefined}
            aria-checked={kind === "choice" ? selected : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            variant="quiet"
            size="sm"
            className={cn("relative h-full", selected && "font-[450] text-[var(--text)]")}
            onClick={() => select(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(index, -1);
              else if (event.key === "ArrowRight" || event.key === "ArrowDown") move(index, 1);
              else if (event.key === "Home") move(index, "first");
              else if (event.key === "End") move(index, "last");
              else return;
              event.preventDefault();
            }}
          >
            {selected ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[var(--r-ctl)] bg-[var(--selected)]" style={{ viewTransitionName: transitionName }} /> : null}
            <span className="relative z-[1]">{option.label}</span>
          </Control>
        );
      })}
    </div>
  );
}
