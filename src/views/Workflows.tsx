import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { WorkflowDesigner } from "@/components/workflows/workflow-designer";
import { WorkflowDetail, type WorkflowView } from "@/components/workflows/workflow-detail";
import { WorkflowTable } from "@/components/workflows/workflow-table";
import { ScheduleSheet } from "@/components/workflows/schedule-sheet";
import { DecisionField } from "@/components/ui/decision-field";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkflowRuns, listWorkflows, resolveWorkflowApproval } from "@/lib/data";
import { createRouteConversationContext, publishConversationContext } from "@/lib/conversation-context";
import { requestAgentPanelOpen } from "@/lib/agent-panel-persistence";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";
import { buildWorkflowCatalog, type WorkflowCatalogItem } from "@/lib/workflow-catalog";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import type { WorkspaceDatabaseFieldValue } from "@/lib/types";
import { useAppStore } from "@/store";

function firstRecordId(value: WorkspaceDatabaseFieldValue) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export function WorkflowsView() {
  const navigate = useNavigate();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("workflow"));
  const [view, setView] = useState<WorkflowView>("runs");
  const [designerOpen, setDesignerOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const workflowQuery = useQuery({
    queryKey: ["workflow-registry", "screen", entityFilter],
    queryFn: () => listWorkflows({ entity: entityFilter, includeInactive: true, limit: 100 }),
    refetchInterval: 60_000,
  });
  const rolesQuery = useQuery({
    queryKey: ["workflow-designer", "role-targets"],
    queryFn: listAgentPanelRoleTargets,
    staleTime: 30_000,
  });
  const runsQuery = useQuery({
    queryKey: ["active-work", "workflow-screen"],
    queryFn: () => listWorkflowRuns({ includeCompleted: true, limit: 100 }),
    refetchInterval: 15_000,
  });
  const starter = useStartWorkflow({ onStarted: () => runsQuery.refetch() });
  const approval = useMutation({
    mutationFn: ({ runId, decision }: { runId: string; decision: "approved" | "rejected" | "changes_requested" }) => resolveWorkflowApproval({
      workflowRunId: runId,
      decision,
      decisionSummary: decision === "approved" ? "Approved in Workflows." : decision === "rejected" ? "Rejected in Workflows." : "Changes requested in Workflows.",
      decidedBy: "Adam",
      confirmWrite: true,
    }),
    onSuccess: () => runsQuery.refetch(),
  });

  const catalog = useMemo(() => buildWorkflowCatalog(workflowQuery.data ?? [], rolesQuery.data ?? []), [rolesQuery.data, workflowQuery.data]);
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const requestedRun = runs.find((run) => run.id === searchParams.get("run"));

  useEffect(() => {
    if (requestedRun?.workflow_record_id) {
      setSelectedId(requestedRun.workflow_record_id);
      setView("runs");
      return;
    }
    if (selectedId && catalog.some((item) => item.workflow.id === selectedId)) return;
    setSelectedId(catalog[0]?.workflow.id ?? null);
  }, [catalog, requestedRun, selectedId]);

  const selectedItem = catalog.find((item) => item.workflow.id === selectedId) ?? null;
  const waitingRuns = runs.filter((run) => run.status?.toLowerCase() === "needs approval");
  const waitingRun = waitingRuns[0];

  function select(item: WorkflowCatalogItem) {
    setSelectedId(item.workflow.id);
    setDesignerOpen(false);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("workflow", item.workflow.id);
      next.delete("run");
      return next;
    }, { replace: true });
  }

  function openDesigner(item: WorkflowCatalogItem) {
    select(item);
    setView("steps");
    setDesignerOpen(true);
  }

  function draftWithAgent(item: WorkflowCatalogItem) {
    const search = `?workflow=${encodeURIComponent(item.workflow.id)}&view=steps`;
    publishConversationContext({
      ...createRouteConversationContext({ pathname: "/workflows", search }),
      selections: [{
        kind: "workspace_record",
        databaseId: GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry,
        recordId: item.workflow.id,
        label: item.workflow.name,
      }],
    });
    requestAgentPanelOpen();
  }

  if (workflowQuery.error) {
    return <div className="p-6"><QueryState isLoading={false} error={workflowQuery.error} isEmpty={false} errorTitle="Workflows unavailable" onRetry={() => void workflowQuery.refetch()}>{null}</QueryState></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--base)] p-5">
      <PageHeader title="Workflows" state={`${catalog.length} definitions`} waiting={waitingRun ? `${waitingRuns.length} ${waitingRuns.length === 1 ? "run waits" : "runs wait"} on you` : undefined} />
      <div className="mt-4 grid gap-4">
        {waitingRun ? (
          <DecisionField
            question={waitingRun.current_step || "This workflow run needs a decision."}
            why={`${waitingRun.name} is paused until you answer.`}
            choices={[
              { id: "approved", label: "Approve", disabled: approval.isPending },
              { id: "changes_requested", label: "Request changes", disabled: approval.isPending },
              { id: "rejected", label: "Reject", disabled: approval.isPending },
            ]}
            onChoose={(decision) => approval.mutate({ runId: waitingRun.id, decision: decision as "approved" | "rejected" | "changes_requested" })}
          />
        ) : null}
        {workflowQuery.isLoading || rolesQuery.isLoading ? <Skeleton lines={5} /> : (
          <WorkflowTable
            items={catalog}
            runs={runs}
            selectedId={selectedId}
            search={search}
            running={starter.isStartingWorkflow}
            onSearch={setSearch}
            onSelect={select}
            onFinish={openDesigner}
            onRun={(item) => void starter.start({ workflowId: item.workflow.workflow_id, triggerSource: "ui" })}
            onMakeRunnable={(item) => {
              const record = firstRecordId(item.workflow.source_document_id);
              navigate(record ? `/docs?record=${encodeURIComponent(record)}` : "/docs");
            }}
          />
        )}
        {selectedItem ? designerOpen && selectedItem.executable ? (
          <div className="min-h-[620px] overflow-hidden rounded-[var(--r-plane)] bg-[var(--mantle)]">
            <WorkflowDesigner
              workflow={selectedItem.workflow}
              roleTargets={rolesQuery.data ?? []}
              onClose={() => setDesignerOpen(false)}
              onDraftWithAgent={() => draftWithAgent(selectedItem)}
              onSaved={() => { setDesignerOpen(false); void workflowQuery.refetch(); }}
            />
          </div>
        ) : (
          <>
            <WorkflowDetail
              item={selectedItem}
              runs={runs}
              roles={rolesQuery.data ?? []}
              view={view}
              onView={(next) => {
                setView(next);
                if (next === "steps" && selectedItem.executable) setDesignerOpen(true);
                if (next === "schedule" && selectedItem.definition) setScheduleOpen(true);
              }}
              onDesign={() => setDesignerOpen(true)}
              onSchedule={() => setScheduleOpen(true)}
            />
          </>
        ) : null}
      </div>
      {selectedItem?.definition ? <ScheduleSheet open={scheduleOpen} workflow={selectedItem.workflow} definition={selectedItem.definition} onOpenChange={setScheduleOpen} /> : null}
    </div>
  );
}
