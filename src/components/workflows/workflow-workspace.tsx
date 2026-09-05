import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowDesigner } from "./workflow-designer";
import { RunsTable, WorkflowSource } from "./workflow-detail";
import { ScheduleSheet } from "./schedule-sheet";
import { AppDialog } from "@/components/ui/app-dialog";
import { Control } from "@/components/ui/control";
import { Skeleton } from "@/components/ui/skeleton";
import { listWorkflowRuns } from "@/lib/data";
import { getWorkflowSource } from "@/lib/workflow-source";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import { requestAgentPanelOpen } from "@/lib/agent-panel-persistence";
import { useWorkflowAgentDraft } from "@/lib/workflow-agent-draft";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";
import type { WorkflowRunItem, WorkflowTemplateItem } from "@/lib/types";

function seedSopDefinition(item: WorkflowCatalogItem, content: string) {
  const definition = createWorkflowDesignerDraft({ id: item.workflow.workflow_id, name: item.workflow.name, ownerRole: item.workflow.owner_role });
  const first = definition.steps[0];
  if (first.kind !== "role-assign") return definition;
  const source = item.workflow.source_document_id;
  const sourceId = Array.isArray(source) ? source[0] : source;
  return { ...definition, inputs: sourceId ? [{ key: "source_document", type: "document-ref" as const }] : [], steps: [{ ...first, title: "Run this SOP", instructions: content, contextRefs: sourceId ? [`document:${sourceId}`] : [] }] };
}

export function WorkflowWorkspace({ item, roleTargets, rolesUnavailable, onRetryRoles, onSaved, onOpenRun, onBack }: {
  item: WorkflowCatalogItem;
  roleTargets: AgentPanelRoleTarget[];
  rolesUnavailable: boolean;
  onRetryRoles: () => void;
  onSaved: (workflow?: WorkflowTemplateItem) => void;
  onOpenRun: (run: WorkflowRunItem) => void;
  onBack: () => void;
}) {
  const workflow = item.workflow;
  const [dirty, setDirty] = useState(false);
  const [detail, setDetail] = useState<"source" | "schedule" | null>(null);
  const [draft, setDraft] = useState<WorkflowDefinitionV1>(() => item.definition ?? createWorkflowDesignerDraft({ id: workflow.workflow_id, name: workflow.name, ownerRole: workflow.owner_role }));
  const [selectedStepId, setSelectedStepId] = useState(draft.steps[0]?.id ?? "");
  const onDraftChange = useCallback((definition: WorkflowDefinitionV1, stepId: string) => { setDraft(definition); setSelectedStepId(stepId); }, []);
  const bridge = useWorkflowAgentDraft({ draftKey: workflow.id || workflow.workflow_id, currentDefinition: draft, selectedStepId });
  const runsQuery = useQuery({ queryKey: ["workflow-runs", workflow.id], queryFn: () => listWorkflowRuns({ workflowId: workflow.id, includeCompleted: true, limit: 100 }), enabled: Boolean(workflow.id), refetchInterval: 15_000 });
  const starter = useStartWorkflow({ onStarted: () => runsQuery.refetch() });
  const sourceQuery = useQuery({ queryKey: ["workflow-source", workflow.id, workflow.updated_at], queryFn: () => getWorkflowSource(workflow), enabled: item.state === "sop-only" });
  const sopDefinition = useMemo(() => item.state === "sop-only" && sourceQuery.data?.content ? seedSopDefinition(item, sourceQuery.data.content) : null, [item, sourceQuery.data]);
  const runsTray = <div className="max-h-64 overflow-auto p-3">
    {!workflow.id ? <p className="text-[var(--t-meta)] text-[var(--text-muted)]">Save and activate this workflow before its first run.</p> : runsQuery.isLoading ? <Skeleton lines={3} /> : <>
      {runsQuery.error ? <p role="alert" className="mb-2 text-[var(--danger)]">Could not refresh this workflow’s run history. <Control size="sm" onClick={() => void runsQuery.refetch()}>Retry</Control></p> : null}
      {runsQuery.data ? <RunsTable runs={runsQuery.data} onOpenRun={onOpenRun} /> : null}
    </>}
  </div>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">

    {rolesUnavailable ? <p role="alert" className="text-[var(--warning)]">Role availability is unavailable. <Control size="sm" onClick={onRetryRoles}>Retry</Control></p> : null}
    {bridge.error ? <p role="alert" className="text-[var(--danger)]">{bridge.error}</p> : null}
    {item.state === "sop-only" && !sopDefinition ? <div className="p-4 text-[var(--text-muted)]"><Control size="sm" onClick={onBack}>Back to workflows</Control><p className="mt-3">{sourceQuery.error ? <>Could not load the full procedure. <Control onClick={() => void sourceQuery.refetch()}>Retry</Control></> : "Loading procedure…"}</p></div> : <WorkflowDesigner
      onBack={onBack}
      runControl={<Control size="sm" disabled={!item.runnable || dirty || rolesUnavailable} loading={starter.isStartingWorkflow} onClick={() => void starter.start({ workflowId: workflow.workflow_id, triggerSource: "ui" })} title={dirty ? "Save your edits before running." : !item.runnable ? "Activate a valid workflow with available roles before running." : undefined}>Run workflow</Control>}
      workflowActions={[
        ...(workflow.id ? [{ label: "Source", onSelect: () => setDetail("source") }] : []),
        { label: "Schedule", disabled: !workflow.id || !item.definition || dirty, reason: dirty ? "Save your edits before scheduling." : undefined, onSelect: () => setDetail("schedule") },
      ]}
      workflow={workflow} roleTargets={roleTargets} initialDefinition={sopDefinition} embedded onSaved={onSaved} onDirtyChange={setDirty}
      onDraftChange={onDraftChange} draftRevision={bridge.draftRevision ?? ""} proposal={bridge.proposal} onProposalApplied={bridge.applied} onProposalDismissed={bridge.dismiss}
      onDraftWithAgent={() => { void bridge.requestWithAgent().then(() => requestAgentPanelOpen()).catch(() => {}); }} runsTray={runsTray}
    />}
    {detail === "source" ? <AppDialog open onOpenChange={(open) => { if (!open) setDetail(null); }} title="Workflow source"><WorkflowSource item={item} /></AppDialog> : null}
    {detail === "schedule" && item.definition ? <ScheduleSheet open workflow={workflow} definition={item.definition} onOpenChange={(open) => { if (!open) setDetail(null); }} /> : null}
  </div>;
}
