import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/app-dialog";
import type { IntelSignal, Investigation } from "@/lib/types";

interface AttachInvestigationDialogProps {
  signal: IntelSignal | null;
  investigations: Investigation[];
  selectedCaseId: string | null;
  onSelectCaseId: (caseId: string | null) => void;
  onCancel: () => void;
  onConfirm: (investigationId: number) => void;
  isSubmitting: boolean;
}

export function AttachInvestigationDialog({
  signal,
  investigations,
  selectedCaseId,
  onSelectCaseId,
  onCancel,
  onConfirm,
  isSubmitting,
}: AttachInvestigationDialogProps) {
  const selected =
    investigations.find((investigation) => investigation.case_id === selectedCaseId) ?? null;

  return (
    <AppDialog
      open={Boolean(signal)}
      onOpenChange={(open) => { if (!open && !isSubmitting) onCancel(); }}
      title="Attach signal to investigation"
      description={signal?.title}
      className="w-full max-w-[520px]"
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button
            onClick={() => { if (selected) onConfirm(selected.id); }}
            disabled={!selected || isSubmitting}
          >
            {isSubmitting ? "Attaching…" : "Attach"}
          </Button>
        </>
      )}
    >
        <div className="grid gap-1.5">
          <label className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            Investigation
          </label>
          <select
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 font-ui text-[13px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            value={selectedCaseId ?? ""}
            onChange={(event) => onSelectCaseId(event.target.value || null)}
          >
            {investigations.length === 0 ? (
              <option value="">No active investigations</option>
            ) : (
              investigations.map((investigation) => (
                <option key={investigation.case_id} value={investigation.case_id}>
                  {investigation.name} ({investigation.case_id})
                </option>
              ))
            )}
          </select>
        </div>
    </AppDialog>
  );
}
