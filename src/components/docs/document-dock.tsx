import { Control } from "@/components/ui/control";
import { cn } from "@/lib/utils";
import type { DocumentMode } from "./document-header";

export function DocumentDock({ mode, onModeChange, positionLabel, readingFocus, onReadingFocus, proposalCount, readOnly = false, decisionBusy = false }: {
  mode: DocumentMode;
  onModeChange: (mode: DocumentMode) => void;
  positionLabel: string;
  readingFocus: boolean;
  onReadingFocus: () => void;
  proposalCount: number;
  readOnly?: boolean;
  decisionBusy?: boolean;
}) {
  return <footer aria-label="Document controls" className="flex min-h-12 shrink-0 items-center gap-1 border-t border-[var(--line)] bg-[var(--ground)] px-3">
    <Control size="sm" variant="quiet" disabled={decisionBusy} aria-pressed={mode === "read"} onClick={() => onModeChange("read")}>Reading</Control>
    <Control size="sm" variant="quiet" disabled={readOnly || decisionBusy} aria-pressed={mode === "edit"} onClick={() => onModeChange("edit")}>Edit</Control>
    <span className="min-w-0 flex-1 truncate px-2 font-mono text-[10px] text-[var(--text-muted)]">{positionLabel}</span>
    {proposalCount > 0 ? <span className="font-mono text-[10px] text-[var(--text-muted)]">{proposalCount} in panel</span> : null}
    <Control size="sm" variant="quiet" aria-pressed={readingFocus} onClick={onReadingFocus} className={cn(readingFocus && "text-[var(--text)]")}>Reading focus</Control>
  </footer>;
}
