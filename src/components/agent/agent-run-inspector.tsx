import { useQuery } from "@tanstack/react-query";
import { ChevronRight, GitBranch, ShieldCheck } from "lucide-react";

import { listWorkEvents } from "@/lib/data/work-receipts";
import { buildRunInspector } from "@/lib/run-inspector";
import { cn } from "@/lib/utils";

export function AgentRunInspector({ workflowRunId }: { workflowRunId: string }) {
  const query = useQuery({
    queryKey: ["agent-run-inspector", workflowRunId],
    queryFn: () => listWorkEvents({ workflowRunId, limit: 100 }),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
  const model = buildRunInspector(query.data ?? []);

  return (
    <details className="mt-2 border-t border-[var(--border-subtle)] pt-2">
      <summary className="cursor-pointer font-ui text-[10.5px] font-medium text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]">
        Inspect run evidence
      </summary>
      <div className="mt-2 space-y-3">
        {query.isLoading ? (
          <p className="font-ui text-[10.5px] text-[var(--overlay-1)]">Loading durable receipts…</p>
        ) : query.error ? (
          <p className="font-ui text-[10.5px] text-[var(--danger)]">Run evidence could not be loaded.</p>
        ) : (
          <>
            <section>
              <p className="flex items-center gap-1 font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                Assignment tree
              </p>
              <div className="mt-1.5 space-y-1">
                {model.nodes.length ? model.nodes.map((node) => (
                  <div key={node.assignmentId} className="flex items-start gap-1.5 font-ui text-[10.5px] text-[var(--subtext-0)]">
                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[var(--overlay-1)]" aria-hidden="true" />
                    <span>
                      <span className="font-medium text-[var(--text)]">{node.role}</span>
                      {" · "}{node.agent} · {node.binding} · {node.status}
                    </span>
                  </div>
                )) : (
                  <p className="font-ui text-[10.5px] text-[var(--overlay-1)]">No structured assignment events reported.</p>
                )}
              </div>
            </section>

            <section>
              <p className="flex items-center gap-1 font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Three-source authority
              </p>
              <div className="mt-1.5 space-y-2">
                {model.authorities.map((authority) => (
                  <dl key={authority.assignmentId} className="grid grid-cols-[74px_1fr] gap-x-2 gap-y-0.5 font-ui text-[10px]">
                    <dt className="text-[var(--overlay-1)]">IntelliZen</dt><dd className="text-[var(--subtext-0)]">{authority.mediated}</dd>
                    <dt className="text-[var(--overlay-1)]">Provider</dt><dd className="text-[var(--subtext-0)]">{authority.providerNative}</dd>
                    <dt className="text-[var(--overlay-1)]">Unmanaged</dt><dd className="text-[var(--subtext-0)]">{authority.unmanaged}</dd>
                  </dl>
                ))}
              </div>
            </section>

            <section>
              <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">Verification</p>
              {model.verifications.length ? model.verifications.map((verification, index) => (
                <p
                  key={`${verification.verifyingAssignmentId}-${index}`}
                  className={cn(
                    "mt-1 font-ui text-[10.5px]",
                    verification.status === "passed"
                      ? "text-[var(--success)]"
                      : verification.status === "failed"
                        ? "text-[var(--danger)]"
                        : "text-[var(--caution)]",
                  )}
                >
                  {verification.label} · {verification.status}
                </p>
              )) : (
                <p className="mt-1 font-ui text-[10.5px] text-[var(--overlay-1)]">No verification receipt yet.</p>
              )}
            </section>

            <section>
              <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">
                Receipts · {model.receipts.length}
              </p>
              <ol className="mt-1 max-h-36 space-y-1 overflow-y-auto">
                {model.receipts.map((receipt) => (
                  <li key={receipt.id} className="font-ui text-[10px] leading-snug text-[var(--subtext-0)]">
                    <span className="font-mono text-[var(--overlay-1)]">{receipt.event_kind}</span>
                    {receipt.summary ? ` · ${receipt.summary}` : ""}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </details>
  );
}
