import { useEffect, useMemo, useState } from "react";

import { toast, toastError } from "@/lib/toast";
import type { WorkspaceDatabaseFieldValue, WorkspaceDatabaseRecordModel } from "@/lib/types";

import { grantsComplete, installApprovedPlugin, parsePluginApproval, PLUGIN_APPROVAL_FIELD, rejectPlugin } from "./approval";

export function PluginApprovalSection({
  record,
  onUpdateField,
}: {
  record: WorkspaceDatabaseRecordModel;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
}) {
  const approval = useMemo(() => parsePluginApproval(record[PLUGIN_APPROVAL_FIELD]), [record]);
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const state = typeof record.plugin_approval_state === "string" ? record.plugin_approval_state : "staged";

  useEffect(() => setGrants({}), [record.id]);
  if (!approval) return null;

  async function decide(next: "installed" | "rejected") {
    setBusy(true);
    try {
      if (next === "installed") await installApprovedPlugin(record.id, approval!, grants);
      else await rejectPlugin(record.id, approval!);
      await onUpdateField(record.id, "plugin_approval_state", next);
      await onUpdateField(record.id, "plugin_capability_grants", JSON.stringify(grants));
      await onUpdateField(record.id, "task_status", "Done");
      await onUpdateField(record.id, "task_stage", next === "installed" ? "Done" : "Rejected");
      toast.success(next === "installed" ? `Plugin “${approval!.name}” installed` : `Plugin “${approval!.name}” rejected`);
    } catch (error) {
      toastError(`Plugin ${next === "installed" ? "install" : "rejection"} failed`, error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="db-record-section px-6 py-3">
      <div className="db-record-section-head">
        <div className="db-record-section-title mb-0">Plugin review</div>
        <span className="db-workflow-run-status">{state}</span>
      </div>
      <div className="space-y-2 text-[var(--t-meta)] text-[var(--text-muted)]">
        <p><span className="text-[var(--text)]">{approval.name}</span> · v{approval.version} · written by {approval.author}</p>
        {approval.capabilities.length ? approval.capabilities.map((capability) => (
          <div key={capability} className="flex items-center justify-between gap-3 rounded-[var(--r-ctl)] bg-[var(--raised)] px-3 py-2">
            <span className="font-mono text-[11px] text-[var(--text)]">{capability}</span>
            <div className="flex gap-1">
              <button type="button" className="db-btn" aria-pressed={grants[capability] === true} onClick={() => setGrants((current) => ({ ...current, [capability]: true }))}>Grant</button>
              <button type="button" className="db-btn" aria-pressed={grants[capability] === false} onClick={() => setGrants((current) => ({ ...current, [capability]: false }))}>Deny</button>
            </div>
          </div>
        )) : <p>No capabilities requested.</p>}
      </div>
      {state === "staged" ? (
        <div className="mt-3 flex gap-1.5">
          <button type="button" className="db-btn db-btn-primary" disabled={busy || !grantsComplete(approval, grants)} onClick={() => void decide("installed")}>{busy ? "Working…" : "Install"}</button>
          <button type="button" className="db-btn db-btn-danger" disabled={busy} onClick={() => void decide("rejected")}>Reject</button>
        </div>
      ) : null}
    </section>
  );
}
