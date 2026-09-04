import { AlertTriangle, CopyPlus, Route, ShieldCheck, X } from "lucide-react";

import { Pill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import type {
  WorkflowDefinitionDrift,
  WorkflowDriftResolution,
  WorkflowDriftResponse,
} from "@/lib/workflow-definition-drift";

export function WorkflowDefinitionDriftPanel({
  drift,
  resolution,
  onResolve,
}: {
  drift: WorkflowDefinitionDrift;
  resolution: WorkflowDriftResolution | null;
  onResolve: (response: WorkflowDriftResponse) => void;
}) {
  if (drift.state !== "drifted") return null;
  return (
    <section
      aria-label="Workflow definition drift"
      className="rounded-[var(--r-ctl)] border border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_7%,var(--base))] px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--warning)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            Definition drift
          </div>
          <p className="mt-1 font-ui text-[var(--t-section)] leading-relaxed text-[var(--subtext-0)]">
            This run remains pinned to v{drift.runVersion}; the Registry is now
            v{drift.currentVersion}. Historical execution will not be upgraded
            implicitly.
          </p>
        </div>
        <Pill variant="waiting">
          {drift.runHash.slice(0, 8)} → {drift.currentHash.slice(0, 8)}
        </Pill>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onResolve("preserve-snapshot")}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Preserve snapshot
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onResolve("clone-definition")}
        >
          <CopyPlus className="h-3.5 w-3.5" />
          Clone as v{drift.currentVersion + 1}
        </Button>
        <Button
          size="sm"
          variant="accent-outline"
          onClick={() => onResolve("reviewed-migration")}
        >
          <Route className="h-3.5 w-3.5" />
          Review migration
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onResolve("reject-upgrade")}
        >
          <X className="h-3.5 w-3.5" />
          Reject upgrade
        </Button>
      </div>
      {resolution ? (
        <p
          data-resolution={resolution.response}
          className="mt-3 font-ui text-[var(--t-section)] text-[var(--subtext-0)]"
        >
          {resolution.message}
        </p>
      ) : null}
    </section>
  );
}
