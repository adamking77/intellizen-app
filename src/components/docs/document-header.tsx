import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Control } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

export type DocumentMode = "read" | "edit";
export type DocumentSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function SaveState({ status, inVault, onRetry }: { status: DocumentSaveStatus; inVault: boolean; onRetry: () => void }) {
  const label = status === "error"
    ? "Save failed"
    : status === "saving" || status === "dirty"
      ? "Saving"
        : inVault
          ? "Saved in vault"
          : "Saved outside vault";
  return (
    <button type="button" onClick={status === "error" ? onRetry : undefined} disabled={status !== "error"} title={label} className="inline-flex items-center gap-1.5 disabled:cursor-default">
      <span aria-hidden className={cn("h-2 w-2 rounded-[var(--r-pill)]", status === "error" ? "bg-[var(--bad)]" : status === "saving" || status === "dirty" || !inVault ? "bg-[var(--text-muted)]" : "bg-[var(--ok)]")} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function DocumentHeader({
  breadcrumb,
  mode,
  saveStatus,
  inVault,
  isTemplate,
  isCramped,
  savingTemplate,
  onBack,
  onModeChange,
  onRetry,
  onSaveTemplate,
  onDelete,
}: {
  breadcrumb: string;
  mode: DocumentMode;
  saveStatus: DocumentSaveStatus;
  inVault: boolean;
  isTemplate: boolean;
  isCramped: boolean;
  savingTemplate: boolean;
  onBack: () => void;
  onModeChange: (mode: DocumentMode) => void;
  onRetry: () => void;
  onSaveTemplate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-14 items-center gap-2 px-5 py-2">
      {isCramped ? <Control size="icon" variant="quiet" onClick={onBack} aria-label="Back to document list"><ArrowLeft className="h-3.5 w-3.5" /></Control> : null}
      <PageHeader
        breadcrumb={breadcrumb}
        state={<SaveState status={saveStatus} inVault={inVault} onRetry={onRetry} />}
        views={<Control variant="quiet" onClick={() => onModeChange(mode === "edit" ? "read" : "edit")}>{mode === "edit" ? "Editing · ⌘E to read" : "Reading · ⌘E to edit"}</Control>}
        action={(
          <div ref={menuRef} className="relative">
            <Control size="icon" variant="quiet" onClick={() => setMenuOpen((open) => !open)} aria-label="Document menu" aria-expanded={menuOpen}><MoreHorizontal className="h-4 w-4" /></Control>
            {menuOpen ? (
              <div className="absolute right-0 top-9 z-40 w-48 rounded-[var(--r-plane)] bg-[var(--raised)] p-1.5 shadow-[var(--shadow-elevated)]">
                {!isTemplate ? <Control variant="quiet" loading={savingTemplate} className="w-full justify-start" onClick={() => { setMenuOpen(false); onSaveTemplate(); }}>Save as template</Control> : null}
                <Control variant="quiet" className="w-full justify-start" disabled title="History is coming in a later package">History</Control>
                <Control variant="danger" className="w-full justify-start" onClick={() => { setMenuOpen(false); onDelete(); }}>Delete</Control>
              </div>
            ) : null}
          </div>
        )}
      />
    </div>
  );
}
