import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}

export function GraphTopbarIconButton({
  children,
  onClick,
  title,
  disabled,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-pill)] text-[var(--overlay-1)]",
        "transition-colors duration-[var(--t-base)] ease-[var(--ease)]",
        "hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--overlay-1)]",
      )}
    >
      {children}
    </button>
  );
}

export function GraphOverflowItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center px-3 py-1.5 text-left font-ui text-[var(--t-meta)] transition-colors duration-[var(--t-base)] ease-[var(--ease)]",
        disabled
          ? "cursor-not-allowed text-[var(--overlay-0)]"
          : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}

export function GraphRailTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[var(--r-pill)] px-2.5 py-1 font-ui text-[var(--t-section)] font-medium transition-colors duration-[var(--t-base)] ease-[var(--ease)]",
        active
          ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
          : "text-[var(--subtext-0)] hover:text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}

export function GraphToolbarButton({
  children,
  onClick,
  title,
  active,
  disabled,
}: ButtonProps & { active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[var(--r-pill)] px-2 transition-colors duration-[var(--t-base)] ease-[var(--ease)]",
        active
          ? "bg-[var(--selected)] text-[var(--text)] hover:bg-[var(--selected-hover)]"
          : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

export function GraphSettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex min-h-9 items-center justify-between rounded-[var(--r-plane)] px-2.5 text-left transition-colors hover:bg-[var(--surface-wash)]"
    >
      <span className="text-meta text-[var(--subtext-1)]">{label}</span>
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 rounded-[var(--r-pill)] border transition-colors duration-[var(--t-base)] ease-[var(--ease)]",
          checked
            ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
            : "border-[var(--border)] bg-[var(--base)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-[var(--r-pill)] transition-[left,background-color] duration-[var(--t-base)] ease-[var(--ease)]",
            checked
              ? "left-[17px] bg-[var(--accent)]"
              : "left-0.5 bg-[var(--overlay-1)]",
          )}
        />
      </span>
    </button>
  );
}

export function GraphStatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-[var(--r-ctl)] border px-2 py-1",
        accent
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[color-mix(in_srgb,var(--mantle)_85%,transparent)]",
      )}
    >
      <span
        className={cn(
          "font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em]",
          accent ? "text-[var(--accent)]" : "text-[var(--overlay-1)]",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[var(--t-section)] tabular-nums",
          accent ? "text-[var(--accent)]" : "text-[var(--text)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function GraphStatBlock({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">
        {label}
      </span>
      <span className="font-mono text-[var(--t-title)] tabular-nums text-[var(--text)]">
        {value}
      </span>
    </div>
  );
}

export function GraphSlider({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-meta">{label}</span>
        <span className="font-mono text-[var(--t-section)] text-[var(--overlay-1)]">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-[var(--accent)]"
      />
    </label>
  );
}
