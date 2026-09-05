import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { WorkflowLibrary } from "@/components/workflows/workflow-library";
import { WorkflowWorkspace } from "@/components/workflows/workflow-workspace";
import { WorkflowRunDrawer } from "@/components/workflows/workflow-run-drawer";
import { Control } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { GENZEN_WORKSPACE_DATABASE_IDS, getWorkspaceRecord, listWorkflows, toWorkflowTemplateItem } from "@/lib/data";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";
import { buildWorkflowCatalog, classifyWorkflow } from "@/lib/workflow-catalog";
import { createWorkflowDesignerDraft, listRecoveredWorkflowDesignerDrafts, storeWorkflowDesignerDraft } from "@/lib/workflow-designer";
import type { WorkflowTemplateItem } from "@/lib/types";
import { useAppStore } from "@/store";

export function newWorkflowTemplate(id: string): WorkflowTemplateItem {
  const definition = createWorkflowDesignerDraft({ id, name: "Untitled workflow" });
  return { id: "", workflow_id: id, name: definition.name, status: "Draft", entity: null, owner_role: null, default_actor: null, source_document_id: null, source_path: null, trigger: "manual", required_inputs: null, default_routing: null, approval_gates: null, expected_output: null, related_databases: [], receipt_template: null, success_criteria: null, failure_behavior: null, definition, definition_version: 1, run_ids: [], body_preview: "", updated_at: "" };
}

export function WorkflowsView() {
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const selectedId = searchParams.get("workflow");
  const draftId = searchParams.get("draft");
  const runId = searchParams.get("run");
  const newDraft = useMemo(() => draftId && /^workflow-[a-f0-9-]{36}$/i.test(draftId) ? newWorkflowTemplate(draftId) : null, [draftId]);
  const workflowQuery = useQuery({ queryKey: ["workflow-registry", "screen", entityFilter], queryFn: () => listWorkflows({ entity: entityFilter, includeInactive: true, limit: 100 }), refetchInterval: 60_000 });
  const rolesQuery = useQuery({ queryKey: ["workflow-designer", "role-targets"], queryFn: listAgentPanelRoleTargets, staleTime: 30_000 });
  const selectedQuery = useQuery({
    queryKey: ["workflow-detail", selectedId],
    queryFn: async () => {
      const record = await getWorkspaceRecord(selectedId!);
      if (record.database_id !== GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry) throw new Error("This record is not a workflow.");
      return toWorkflowTemplateItem(record);
    },
    enabled: Boolean(selectedId && !newDraft), refetchInterval: 60_000,
  });
  const fullCatalog = useMemo(() => buildWorkflowCatalog(workflowQuery.data ?? [], rolesQuery.data ?? []), [rolesQuery.data, workflowQuery.data]);
  const catalog = useMemo(() => fullCatalog.filter((item) => item.state !== "sop-only"), [fullCatalog]);
  const localDrafts = listRecoveredWorkflowDesignerDrafts().filter((entry) => /^workflow-[a-f0-9-]{36}$/i.test(entry.recordId)).map((entry) => classifyWorkflow({ ...newWorkflowTemplate(entry.recordId), name: entry.definition.name, definition: entry.definition }, rolesQuery.data ?? []));
  const selectedItem = useMemo(() => {
    const workflow = newDraft ?? selectedQuery.data;
    return workflow ? classifyWorkflow(workflow, rolesQuery.data ?? []) : null;
  }, [newDraft, selectedQuery.data, rolesQuery.data]);
  const backToLibrary = useCallback(() => setSearchParams((current) => {
    const next = new URLSearchParams(current); next.delete("workflow"); next.delete("draft"); next.delete("view"); next.delete("run"); return next;
  }), [setSearchParams]);
  const closeRun = useCallback(() => setSearchParams((current) => { const next = new URLSearchParams(current); next.delete("run"); return next; }, { replace: true }), [setSearchParams]);
  function newWorkflow() {
    const id = `workflow-${crypto.randomUUID()}`;
    storeWorkflowDesignerDraft(id, { definition: createWorkflowDesignerDraft({ id, name: "Untitled workflow" }), baseUpdatedAt: "" });
    setSearchParams({ draft: id });
  }
  function saved(created?: WorkflowTemplateItem) {
    if (created) { queryClient.setQueryData(["workflow-detail", created.id], created); setSearchParams({ workflow: created.id }, { replace: true }); }
    else void selectedQuery.refetch();
    void workflowQuery.refetch();
  }
  const editing = Boolean(selectedId || draftId);
  return <div className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--base)] p-5">
    {editing ? <>
      {!selectedItem ? <Control size="sm" variant="quiet" className="mb-3 shrink-0 self-start" onClick={backToLibrary}>Back to workflows</Control> : null}
      {selectedItem ? <WorkflowWorkspace key={selectedItem.workflow.id || selectedItem.workflow.workflow_id} item={selectedItem} onBack={backToLibrary} roleTargets={rolesQuery.data ?? []} rolesUnavailable={Boolean(rolesQuery.error)} onRetryRoles={() => void rolesQuery.refetch()} onSaved={saved} onOpenRun={(run) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("run", run.id); return next; })} /> : selectedQuery.isLoading ? <Skeleton lines={8} /> : <QueryState isLoading={false} error={selectedQuery.error ?? new Error("The requested draft is unavailable.")} isEmpty={false} errorTitle="Workflow unavailable" onRetry={() => void selectedQuery.refetch()}>{null}</QueryState>}
      {selectedQuery.error && selectedItem ? <p role="alert" className="mt-2 text-[var(--danger)]">Could not refresh this workflow. Your draft is retained. <Control size="sm" onClick={() => void selectedQuery.refetch()}>Retry</Control></p> : null}
    </> : <>
      <PageHeader title="Workflows" state="Design how your agents work together." action={<Control size="sm" variant="primary" onClick={newWorkflow}><Plus size={14} aria-hidden />New workflow</Control>} />
      <div className="mt-5">
        <QueryState isLoading={workflowQuery.isLoading && !localDrafts.length} error={workflowQuery.error} isEmpty={false} retainContentOnError={Boolean(workflowQuery.data || localDrafts.length)} errorTitle="Workflows unavailable" onRetry={() => void workflowQuery.refetch()}>
          {rolesQuery.error ? <p role="alert" className="mb-3 text-[var(--warning)]">Role availability could not be checked. <Control size="sm" onClick={() => void rolesQuery.refetch()}>Retry</Control></p> : null}
          <WorkflowLibrary items={[...localDrafts, ...catalog]} onOpen={(item) => setSearchParams(item.workflow.id ? { workflow: item.workflow.id } : { draft: item.workflow.workflow_id })} onCreate={newWorkflow} />
          {fullCatalog.length > catalog.length ? <p className="mt-5 text-[var(--t-meta)] text-[var(--text-muted)]">{fullCatalog.length - catalog.length} written procedures in <Link to="/docs" className="text-[var(--accent-text)] hover:underline">Docs</Link> can become workflows.</p> : null}
        </QueryState>
      </div>
    </>}
    {runId ? <WorkflowRunDrawer runId={runId} item={selectedItem} onClose={closeRun} /> : null}
  </div>;
}
