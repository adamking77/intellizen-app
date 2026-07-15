import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fingerprint, Play, RefreshCw } from "lucide-react";

import { listIntelClaims, listIntelEntities, OPERATOR_ACTOR } from "@/lib/data";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import type { IntelEntityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ENTITY_TONE: Record<IntelEntityType, string> = {
  person: "var(--entity-person)",
  organization: "var(--entity-org)",
  object: "var(--entity-topic)",
  location: "var(--entity-location)",
  event: "var(--entity-event)",
};

/**
 * Case intelligence substrate: canonical POLE entities + Admiralty-graded
 * claims for the selected case, and the 6-phase OSINT workflow launcher.
 */
export function CaseIntelPanel({ caseId, subject }: { caseId: string; subject: string }) {
  const [expanded, setExpanded] = useState(true);
  const entitiesQuery = useQuery({
    queryKey: ["intel-entities", caseId],
    queryFn: () => listIntelEntities({ caseId, limit: 30 }),
    staleTime: 30_000,
  });
  const claimsQuery = useQuery({
    queryKey: ["intel-claims", caseId],
    queryFn: () => listIntelClaims({ caseId, limit: 15 }),
    staleTime: 30_000,
  });
  const { isStartingWorkflow, start } = useStartWorkflow();

  const entities = entitiesQuery.data ?? [];
  const claims = claimsQuery.data ?? [];
  const loading = entitiesQuery.isLoading || claimsQuery.isLoading;
  const loadError = entitiesQuery.error ?? claimsQuery.error;

  return (
    <div className="shrink-0 border-t border-[var(--border)]">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--surface-wash)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
      >
        <span className="flex items-center gap-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          <Fingerprint className="h-3.5 w-3.5" />
          Intelligence
        </span>
        <span className="font-mono text-[10px] text-[var(--subtext-0)]">
          {entities.length} entities · {claims.length} claims
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 px-5 pb-4">
          {loading ? (
            <p className="font-ui text-[12px] text-[var(--overlay-1)]">Loading case intelligence…</p>
          ) : loadError ? (
            <p className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] px-3 py-2 font-ui text-[12px] text-[var(--danger)]">
              Case intelligence could not be loaded.
            </p>
          ) : (
            <>
              {entities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {entities.map((entity) => (
                    <span
                      key={entity.id}
                      title={entity.summary ?? entity.entity_type}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 font-ui text-[11px] text-[var(--subtext-0)]"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: ENTITY_TONE[entity.entity_type] }}
                      />
                      {entity.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
                  No canonical entities resolved for this case yet. Collation (Phase 3) populates them.
                </p>
              )}

              {claims.length > 0 ? (
                <ul className="space-y-1">
                  {claims.slice(0, 5).map((claim) => (
                    <li key={claim.id} className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "rounded border px-1 font-mono text-[10px]",
                            claim.source_reliability && claim.info_credibility
                              ? "border-[var(--accent-border)] text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--overlay-1)]",
                          )}
                          title="Admiralty grade (source reliability x information credibility)"
                        >
                          {claim.source_reliability ?? "?"}
                          {claim.info_credibility ?? "?"}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">{claim.claim_origin ?? "ungraded"}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 font-ui text-[11px] leading-snug text-[var(--subtext-0)]">{claim.claim}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          <button
            type="button"
            disabled={isStartingWorkflow}
            onClick={() =>
              void start({
                workflowId: "intel.osint_investigation",
                triggerSource: "ui",
                context: {
                  source: "investigation_route",
                  case_id: caseId,
                  subject,
                  phase: "operational_planning",
                },
                dispatchPrompt: `Begin Phase 1 (Operational Planning) of the 6-phase OSINT investigation for case ${caseId} ("${subject}") per SOP document 1676. Produce the operational plan with PLAN justification (Proportionality, Legality, Accountability, Necessity), subject definition, scope, seed entities, and initial hypotheses. Do NOT begin collection until the plan gate passes. Requested by ${OPERATOR_ACTOR}.`,
              })
            }
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 font-ui text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
          >
            {isStartingWorkflow ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Start 6-phase OSINT investigation
          </button>
        </div>
      ) : null}
    </div>
  );
}
