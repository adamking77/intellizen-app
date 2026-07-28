import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Plus, Save, ShieldCheck, X } from "lucide-react";

import { WorkflowTopology } from "@/components/workflows/workflow-topology";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import { publishAgentPanelRoleMessage } from "@/lib/agent-panel-roles";
import { saveWorkflowDefinition } from "@/lib/data";
import type { WorkflowTemplateItem } from "@/lib/types";
import {
  addWorkflowDesignerStep,
  connectWorkflowDesignerEdge,
  createWorkflowDesignerDraft,
  updateWorkflowDesignerStep,
  workflowAuthorityDiff,
  type DesignerStepKind,
} from "@/lib/workflow-designer";
import {
  dryRunWorkflowDefinition,
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
  type WorkflowRoleResolution,
  type WorkflowRoleAssignStep,
  type WorkflowStep,
} from "@/lib/workflow-schema";
import { buildWorkflowTopology } from "@/lib/workflow-topology";
import { cn } from "@/lib/utils";

const STEP_KINDS: Array<{ id: DesignerStepKind; label: string }> = [
  { id: "role-assign", label: "Role assignment" },
  { id: "condition", label: "Condition" },
  { id: "approval", label: "Approval" },
  { id: "artifact", label: "Artifact" },
  { id: "decision", label: "Decision" },
];

interface PendingSave {
  definition: WorkflowDefinitionV1;
  activate: boolean;
  diff: ReturnType<typeof workflowAuthorityDiff>;
}

export function WorkflowDesigner({
  workflow,
  roleTargets,
  initialDefinition = null,
  onClose,
  onSaved,
}: {
  workflow: WorkflowTemplateItem;
  roleTargets: AgentPanelRoleTarget[];
  initialDefinition?: WorkflowDefinitionV1 | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existingDefinition = useMemo(() => {
    const validation = validateWorkflowDefinition(workflow.definition);
    return validation.valid
      ? (structuredClone(workflow.definition) as WorkflowDefinitionV1)
      : null;
  }, [workflow.definition]);
  const initialDraft = useMemo(() => {
    const validation = validateWorkflowDefinition(initialDefinition);
    if (validation.valid) {
      return structuredClone(initialDefinition) as WorkflowDefinitionV1;
    }
    return (
      existingDefinition ??
      createWorkflowDesignerDraft({
        id: workflow.workflow_id,
        name: workflow.name,
        ownerRole: workflow.owner_role,
      })
    );
  }, [
    existingDefinition,
    initialDefinition,
    workflow.name,
    workflow.owner_role,
    workflow.workflow_id,
  ]);
  const [definition, setDefinition] = useState<WorkflowDefinitionV1>(() =>
    initialDraft,
  );
  const [selectedStepId, setSelectedStepId] = useState(definition.steps[0]?.id ?? "");
  const [addKind, setAddKind] = useState<DesignerStepKind>("role-assign");
  const [dryRun, setDryRun] = useState<ReturnType<typeof dryRunWorkflowDefinition> | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = initialDraft;
    setDefinition(next);
    setSelectedStepId(next.steps[0]?.id ?? "");
    setDryRun(null);
  }, [
    initialDraft,
    workflow.id,
  ]);

  useEffect(() => {
    publishAgentPanelRoleMessage({ collapsed: true });
  }, []);

  const validation = validateWorkflowDefinition(definition);
  const selectedStep =
    definition.steps.find((step) => step.id === selectedStepId) ??
    definition.steps[0];
  const targetOptions = [
    ...definition.steps.map((step) => step.id),
    "complete",
    "blocked",
    "escalate",
  ];
  const topology = useMemo(
    () =>
      buildWorkflowTopology({
        definition,
        roleTargets,
        mode: dryRun ? "dry-run" : "definition",
        dryRun,
      }),
    [definition, dryRun, roleTargets],
  );

  function commit(next: WorkflowDefinitionV1) {
    setDefinition(next);
    setDryRun(null);
  }

  function updateSelected(step: WorkflowStep) {
    commit(updateWorkflowDesignerStep(definition, step));
  }

  function addStep() {
    const next = addWorkflowDesignerStep(definition, addKind);
    commit(next);
    setSelectedStepId(next.steps[next.steps.length - 1].id);
  }

  function connectEdge(
    sourceStepId: string,
    target: string,
    handle: "next" | "then" | "else",
  ) {
    commit(
      connectWorkflowDesignerEdge(definition, {
        sourceStepId,
        target,
        handle,
      }),
    );
  }

  function askRole(roleKey: string) {
    publishAgentPanelRoleMessage({ roleKey, open: true });
  }

  function runDryRun() {
    const roleResolutions: Record<string, WorkflowRoleResolution> = Object.fromEntries(
      roleTargets.map((role) => [
        role.roleKey,
        {
          role: role.roleKey,
          roleStatus: "active" as const,
          agent: role.agentKey,
          agentStatus: role.agentKey ? ("active" as const) : null,
          bindingRef: role.bindingRef,
          adapterId: role.adapterId,
          authReady: role.state === "ready",
          execution: role.execution,
          resolution: "primary-active-occupant" as const,
        },
      ]),
    );
    for (const step of definition.steps) {
      if (
        step.kind !== "role-assign" ||
        step.resolution !== "explicit-agent-override"
      ) {
        continue;
      }
      const target = roleTargets.find(
        (role) => role.agentKey === step.agentOverride,
      );
      roleResolutions[step.role] = {
        role: step.role,
        roleStatus: roleTargets.some((role) => role.roleKey === step.role)
          ? "active"
          : "retired",
        agent: target?.agentKey ?? null,
        agentStatus: target?.agentKey ? "active" : null,
        bindingRef: target?.bindingRef ?? null,
        adapterId: target?.adapterId ?? null,
        authReady: target?.state === "ready",
        execution: target?.execution ?? null,
        resolution: "explicit-agent-override",
      };
    }
    setDryRun(
      dryRunWorkflowDefinition({
        definition,
        roleResolutions,
        knownApprovalRoles: roleTargets.map((role) => role.roleKey),
      }),
    );
  }

  async function beginSave(activate: boolean) {
    const candidate = {
      ...definition,
      version: existingDefinition ? existingDefinition.version + 1 : 1,
    };
    const candidateValidation = validateWorkflowDefinition(candidate);
    if (!candidateValidation.valid) return;
    await saveWorkflowDefinition({
      workflowRecordId: workflow.id,
      definition: candidate,
      activate,
      confirmWrite: false,
    });
    setPendingSave({
      definition: candidate,
      activate,
      diff: workflowAuthorityDiff(existingDefinition, candidate),
    });
  }

  async function confirmSave() {
    if (!pendingSave) return;
    setSaving(true);
    try {
      await saveWorkflowDefinition({
        workflowRecordId: workflow.id,
        definition: pendingSave.definition,
        activate: pendingSave.activate,
        confirmWrite: true,
      });
      setPendingSave(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--base)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-ui text-[13px] font-semibold text-[var(--text)]">
            {definition.name}
          </p>
          <p className="font-mono text-[10px] text-[var(--overlay-1)]">
            {definition.schema} · editing v{definition.version}
          </p>
        </div>
        <Badge variant={validation.valid ? "success" : "warning"}>
          {validation.valid ? "Valid" : `${validation.errors.length} issues`}
        </Badge>
        <Button size="sm" variant="ghost" onClick={runDryRun}>
          Validate / dry-run
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void beginSave(false)}
          disabled={!validation.valid}
        >
          <Save className="h-3.5 w-3.5" />
          Save draft
        </Button>
        <Button
          size="sm"
          onClick={() => void beginSave(true)}
          disabled={!validation.valid}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Activate
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close designer">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:grid xl:grid-cols-[220px_minmax(520px,1fr)_340px]">
        <aside className="min-h-0 overflow-y-auto border-b border-[var(--border)] bg-[var(--mantle)] p-3 xl:border-b-0 xl:border-r">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">
            Workflow outline
          </p>
          <div className="mt-3 space-y-1.5">
            {definition.steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setSelectedStepId(step.id)}
                className={cn(
                  "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                  selectedStep?.id === step.id
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--base)] hover:border-[var(--border-strong)]",
                )}
              >
                <span className="block font-mono text-[9px] text-[var(--overlay-1)]">
                  {index + 1} · {step.kind}
                </span>
                <span className="mt-1 block font-ui text-[11px] font-semibold leading-snug text-[var(--text)]">
                  {step.title}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <select
              value={addKind}
              onChange={(event) => setAddKind(event.target.value as DesignerStepKind)}
              aria-label="Step kind"
              className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[11px] text-[var(--text)]"
            >
              {STEP_KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>{kind.label}</option>
              ))}
            </select>
            <Button className="mt-2 w-full" size="sm" variant="outline" onClick={addStep}>
              <Plus className="h-3.5 w-3.5" />
              Add step
            </Button>
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">
              Validation
            </p>
            <p className={cn("mt-1 font-ui text-[10.5px]", validation.valid ? "text-[var(--success)]" : "text-[var(--danger)]")}>
              {validation.valid ? "Schema and graph valid" : `${validation.errors.length} issues`}
            </p>
          </div>
        </aside>

        <main className="relative min-h-[440px] overflow-hidden border-b border-[var(--border)] xl:border-b-0 xl:border-r">
          <WorkflowTopology
            topology={topology}
            selectedStepId={selectedStepId}
            editable={!dryRun}
            onSelectStep={setSelectedStepId}
            onConnectEdge={connectEdge}
          />

          {dryRun ? (
            <section className="absolute inset-x-3 bottom-3 z-10 max-h-[34%] overflow-y-auto rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--base)_94%,transparent)] p-3 shadow-[var(--shadow-elevated)] backdrop-blur">
              <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--overlay-1)]">
                Dry-run · dispatches nothing
              </p>
              <p className={cn("mt-1 font-ui text-[11px]", dryRun.valid ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                {dryRun.valid ? "Role, approval, and graph checks passed." : `${dryRun.errors.length} checks need attention.`}
              </p>
              <ol className="mt-2 space-y-1 font-ui text-[10.5px] text-[var(--subtext-0)]">
                {dryRun.sequence.map((entry, index) => {
                  const step = entry as Record<string, unknown>;
                  const stepId = String(step.stepId ?? `step-${index}`);
                  const role = typeof step.role === "string" ? step.role : null;
                  const execution =
                    typeof step.execution === "string" ? step.execution : null;
                  return (
                    <li key={stepId}>
                      {stepId} · {String(step.kind ?? "unknown")}
                      {role ? ` · ${role}${execution ? ` · ${execution}` : ""}` : ""}
                    </li>
                  );
                })}
              </ol>
              {dryRun.errors.length > 0 ? (
                <ul className="mt-2 space-y-1 font-ui text-[10px] text-[var(--danger)]">
                  {dryRun.errors.map((error) => (
                    <li key={`${error.path}-${error.code}`}>{error.path} · {error.message}</li>
                  ))}
                </ul>
              ) : null}
              <Button className="mt-2" size="sm" variant="ghost" onClick={() => setDryRun(null)}>
                Return to design
              </Button>
            </section>
          ) : null}
        </main>

        <aside className="min-h-0 overflow-y-auto p-4">
          {selectedStep ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="workflow-step-title"
                  className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]"
                >
                  Title
                </label>
                <input
                  id="workflow-step-title"
                  value={selectedStep.title}
                  onChange={(event) => updateSelected({ ...selectedStep, title: event.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-ui text-[12px] text-[var(--text)]"
                />
              </div>

              {selectedStep.kind === "role-assign" ? (
                <>
                  <div>
                    <label
                      htmlFor="workflow-step-role"
                      className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]"
                    >
                      Role
                    </label>
                    <select
                      id="workflow-step-role"
                      value={selectedStep.role}
                      onChange={(event) => {
                        const target = roleTargets.find((role) => role.roleKey === event.target.value);
                        updateSelected({
                          ...selectedStep,
                          role: event.target.value,
                          execution: target?.execution ?? selectedStep.execution,
                        } as WorkflowRoleAssignStep);
                      }}
                      className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-ui text-[12px] text-[var(--text)]"
                    >
                      {roleTargets.map((role) => (
                        <option key={role.roleKey} value={role.roleKey}>{role.roleName} · {role.state}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => askRole(selectedStep.role)}
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                    Ask this role
                  </Button>
                  <div>
                    <label
                      htmlFor="workflow-step-instructions"
                      className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]"
                    >
                      Instructions
                    </label>
                    <textarea
                      id="workflow-step-instructions"
                      value={selectedStep.instructions}
                      onChange={(event) => updateSelected({ ...selectedStep, instructions: event.target.value })}
                      rows={5}
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] p-2.5 font-ui text-[12px] leading-relaxed text-[var(--text)]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">
                      Execution
                      <select
                        value={selectedStep.execution}
                        onChange={(event) => updateSelected({ ...selectedStep, execution: event.target.value as "ephemeral" | "durable" })}
                        className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-ui text-[11px] normal-case text-[var(--text)]"
                      >
                        <option value="ephemeral">ephemeral</option>
                        <option value="durable">durable</option>
                      </select>
                    </label>
                    <label className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">
                      Timeout
                      <input
                        type="number"
                        min={1}
                        max={240}
                        value={selectedStep.timeoutMinutes}
                        onChange={(event) => updateSelected({ ...selectedStep, timeoutMinutes: Number(event.target.value) })}
                        className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-mono text-[11px] normal-case text-[var(--text)]"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 font-ui text-[11px] text-[var(--subtext-0)]">
                    <input
                      type="checkbox"
                      checked={selectedStep.verification.required}
                      onChange={(event) => updateSelected({
                        ...selectedStep,
                        verification: {
                          required: event.target.checked,
                          method: event.target.checked ? selectedStep.verification.method ?? "" : null,
                        },
                      })}
                    />
                    Independent verification required
                  </label>
                  {selectedStep.verification.required ? (
                    <input
                      aria-label="Verification method"
                      value={selectedStep.verification.method ?? ""}
                      onChange={(event) => updateSelected({
                        ...selectedStep,
                        verification: { required: true, method: event.target.value },
                      })}
                      placeholder="verifier-step:step_3"
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-mono text-[11px] text-[var(--text)]"
                    />
                  ) : null}
                </>
              ) : null}

              {selectedStep.kind === "condition" ? (
                <>
                  <textarea
                    value={selectedStep.expr}
                    onChange={(event) => updateSelected({ ...selectedStep, expr: event.target.value })}
                    rows={3}
                    aria-label="Condition expression"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] p-2.5 font-mono text-[11px] text-[var(--text)]"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {(["then", "else"] as const).map((field) => (
                      <label key={field} className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">
                        {field}
                        <select
                          value={selectedStep[field]}
                          onChange={(event) => updateSelected({ ...selectedStep, [field]: event.target.value })}
                          className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-mono text-[10px] normal-case text-[var(--text)]"
                        >
                          {targetOptions.filter((target) => target !== selectedStep.id).map((target) => <option key={target} value={target}>{target}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}

              {selectedStep.kind === "approval" ? (
                <>
                  <input value={selectedStep.gate} onChange={(event) => updateSelected({ ...selectedStep, gate: event.target.value })} aria-label="Approval gate role" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-mono text-[11px] text-[var(--text)]" />
                  <input value={selectedStep.payloadRef} onChange={(event) => updateSelected({ ...selectedStep, payloadRef: event.target.value })} aria-label="Approval payload reference" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-mono text-[11px] text-[var(--text)]" />
                </>
              ) : null}

              {selectedStep.kind === "artifact" ? (
                <>
                  <select value={selectedStep.action} onChange={(event) => updateSelected({ ...selectedStep, action: event.target.value as typeof selectedStep.action })} aria-label="Artifact action" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-ui text-[11px] text-[var(--text)]">
                    <option value="create-doc">Create document</option>
                    <option value="revise-doc">Revise document</option>
                    <option value="create-record">Create record</option>
                    <option value="simulate-consequential-action">Simulate consequential action</option>
                  </select>
                  <input value={selectedStep.template} onChange={(event) => updateSelected({ ...selectedStep, template: event.target.value })} aria-label="Artifact template" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-mono text-[11px] text-[var(--text)]" />
                </>
              ) : null}

              {selectedStep.kind === "decision" ? (
                <textarea value={selectedStep.rationale} onChange={(event) => updateSelected({ ...selectedStep, rationale: event.target.value })} aria-label="Decision rationale" rows={4} className="w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] p-2.5 font-ui text-[12px] text-[var(--text)]" />
              ) : null}

              {selectedStep.kind !== "condition" ? (
                <label className="block font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">
                  Next
                  <select
                    value={selectedStep.next ?? ""}
                    onChange={(event) => updateSelected({ ...selectedStep, next: event.target.value || null })}
                    className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-mono text-[10px] normal-case text-[var(--text)]"
                  >
                    <option value="">terminal</option>
                    {targetOptions.filter((target) => target !== selectedStep.id).map((target) => <option key={target} value={target}>{target}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          {!validation.valid ? (
            <ul className="mt-5 space-y-1 border-t border-[var(--border)] pt-4 font-ui text-[10.5px] text-[var(--danger)]">
              {validation.errors.map((error) => <li key={`${error.path}-${error.code}`}>{error.path} · {error.message}</li>)}
            </ul>
          ) : null}
        </aside>
      </div>

      <AppDialog
        open={pendingSave !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingSave(null);
        }}
        title={pendingSave?.activate ? "Activate workflow version?" : "Save workflow version?"}
        description="The Registry record and every future run use this exact schema snapshot."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingSave(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void confirmSave()} disabled={saving}>
              {saving ? "Saving…" : "Confirm write"}
            </Button>
          </>
        }
      >
        {pendingSave ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">v{pendingSave.definition.version}</Badge>
              <Badge variant={pendingSave.diff.authorityExpanded ? "warning" : "secondary"}>
                {pendingSave.diff.authorityExpanded ? "Authority expands" : "No authority expansion"}
              </Badge>
              {pendingSave.diff.addedApprovalGates.map((gate) => <Badge key={gate} variant="info">+ {gate}</Badge>)}
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--crust)] p-3 font-mono text-[10px] leading-relaxed text-[var(--subtext-0)]">
              {JSON.stringify(pendingSave.definition, null, 2)}
            </pre>
          </div>
        ) : null}
      </AppDialog>
    </div>
  );
}
