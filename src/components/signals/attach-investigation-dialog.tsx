import { Button } from "@/components/ui/button";
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
  if (!signal) return null;

  const selected =
    investigations.find((investigation) => investigation.case_id === selectedCaseId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-[520px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-elevated)]">
        <p className="text-sm font-semibold text-[var(--foreground)]">
          Attach Signal to Investigation
        </p>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">{signal.title}</p>

        <div className="mt-4">
          <label className="text-xs font-medium text-[var(--foreground-muted)]">
            Investigation
          </label>
          <select
            className="mt-1 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
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

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!selected) return;
              onConfirm(selected.id);
            }}
            disabled={!selected || isSubmitting}
          >
            {isSubmitting ? "Attaching..." : "Attach"}
          </Button>
        </div>
      </div>
    </div>
  );
}
