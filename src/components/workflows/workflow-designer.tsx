import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Plus, Save, ShieldCheck, X } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Card } from "@/components/ui/card";
import { Control } from "@/components/ui/control";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import { publishAgentPanelRoleMessage } from "@/lib/agent-panel-roles";
import { saveWorkflowDefinition } from "@/lib/data";
import type { WorkflowTemplateItem } from "@/lib/types";
import {
  addWorkflowDesignerStep,
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
  onDraftWithAgent,
}: {
  workflow: WorkflowTemplateItem;
  roleTargets: AgentPanelRoleTarget[];
  initialDefinition?: WorkflowDefinitionV1 | null;
  onClose: () => void;
  onSaved: () => void;
  onDraftWithAgent: () => void;
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
  function commit(next: WorkflowDefinitionV1) {
    setDefinition(next);
    setDryRun(null);
  }

  function updateSelected(step: WorkflowStep) {
    commit(updateWorkflowDesignerStep(definition, step));
  }

  function addStep(kind: DesignerStepKind) {
    const next = addWorkflowDesignerStep(definition, kind);
    commit(next);
    setSelectedStepId(next.steps[next.steps.length - 1].id);
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
          <p className="truncate font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">
            {definition.name}
          </p>
          <p className="font-mono text-[var(--t-count)] text-[var(--overlay-1)]">
            {definition.schema} · editing v{definition.version}
          </p>
        </div>
        <Pill variant={validation.valid ? "verified" : "waiting"}>
          {validation.valid ? "Valid" : `${validation.errors.length} issues`}
        </Pill>
        <Control size="sm" variant="quiet" onClick={onDraftWithAgent}>Draft with an agent</Control>
        <Control size="sm" variant="quiet" onClick={runDryRun}>
          Validate / dry-run
        </Control>
        <Control
          size="sm"
          onClick={() => void beginSave(false)}
          disabled={!validation.valid}
        >
          <Save className="h-3.5 w-3.5" />
          Save draft
        </Control>
        <Control
          size="sm"
          variant="primary"
          onClick={() => void beginSave(true)}
          disabled={!validation.valid}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Activate
        </Control>
        <Control size="icon" variant="quiet" onClick={onClose} aria-label="Close designer">
          <X className="h-4 w-4" />
        </Control>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:grid xl:grid-cols-[190px_minmax(420px,1fr)_340px]">
        <aside className="min-h-0 overflow-y-auto bg-[var(--base)] p-3">
          <p className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.12em] text-[var(--overlay-1)]">
            Add a step
          </p>
          <div className="mt-3 grid gap-1">
            {STEP_KINDS.map((kind) => <Control key={kind.id} variant="quiet" className="justify-start" onClick={() => addStep(kind.id)}>{kind.label}</Control>)}
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.12em] text-[var(--overlay-1)]">
              Validation
            </p>
            <p className={cn("mt-1 font-ui text-[var(--t-count)]", validation.valid ? "text-[var(--success)]" : "text-[var(--danger)]")}>
              {validation.valid ? "Schema and graph valid" : `${validation.errors.length} issues`}
            </p>
          </div>
        </aside>

        <main className="min-h-[440px] overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-xl">
            {definition.steps.map((step, index) => (
              <div key={step.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedStepId(step.id)}>
                  <Card selected={selectedStep?.id === step.id}>
                    <div className="flex items-center gap-2"><span className="font-mono text-[var(--t-count)] text-[var(--text-muted)]">{index + 1}</span><span className="font-ui text-[var(--t-count)] uppercase tracking-[0.1em] text-[var(--text-muted)]">{step.kind}</span></div>
                    <p className="mt-1 font-ui text-[var(--t-ui)] font-medium">{step.title}</p>
                    {step.kind === "condition" ? <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-[var(--text-muted)]"><span>yes → {step.then}</span><span>no → {step.else}</span></div> : null}
                  </Card>
                </button>
                {index < definition.steps.length - 1 ? <div className="flex h-10 items-center justify-center"><Control size="icon" variant="quiet" onClick={() => addStep("role-assign")} aria-label="Add role assignment"><Plus className="h-3.5 w-3.5" /></Control></div> : null}
              </div>
            ))}
          </div>

          {dryRun ? (
            <section className="absolute inset-x-3 bottom-3 z-10 max-h-[34%] overflow-y-auto rounded-[var(--r-ctl)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--base)_94%,transparent)] p-3 shadow-[var(--shadow-elevated)] backdrop-blur">
              <p className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.12em] text-[var(--overlay-1)]">
                Dry-run · dispatches nothing
              </p>
              <p className={cn("mt-1 font-ui text-[var(--t-section)]", dryRun.valid ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                {dryRun.valid ? "Role, approval, and graph checks passed." : `${dryRun.errors.length} checks need attention.`}
              </p>
              <ol className="mt-2 space-y-1 font-ui text-[var(--t-count)] text-[var(--subtext-0)]">
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
                <ul className="mt-2 space-y-1 font-ui text-[var(--t-count)] text-[var(--danger)]">
                  {dryRun.errors.map((error) => (
                    <li key={`${error.path}-${error.code}`}>{error.path} · {error.message}</li>
                  ))}
                </ul>
              ) : null}
              <Control className="mt-2" size="sm" variant="quiet" onClick={() => setDryRun(null)}>
                Return to design
              </Control>
            </section>
          ) : null}
        </main>

        <aside className="min-h-0 overflow-y-auto p-4">
          {selectedStep ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="workflow-step-title"
                  className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]"
                >
                  Title
                </label>
                <Input
                  id="workflow-step-title"
                  value={selectedStep.title}
                  onChange={(event) => updateSelected({ ...selectedStep, title: event.target.value })}
                  className="mt-1"
                />
              </div>

              {selectedStep.kind === "role-assign" ? (
                <>
                  <div>
                    <label
                      htmlFor="workflow-step-role"
                      className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]"
                    >
                      Role
                    </label>
                    <Select
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
                      containerClassName="mt-1 flex"
                    >
                      {roleTargets.map((role) => (
                        <option key={role.roleKey} value={role.roleKey}>{role.roleName} · {role.state}</option>
                      ))}
                    </Select>
                  </div>
                  <Control
                    type="button"
                    size="sm"
                    variant="quiet"
                    className="w-full"
                    onClick={() => askRole(selectedStep.role)}
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                    Ask this role
                  </Control>
                  <div>
                    <label
                      htmlFor="workflow-step-instructions"
                      className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]"
                    >
                      Instructions
                    </label>
                    <Textarea
                      id="workflow-step-instructions"
                      value={selectedStep.instructions}
                      onChange={(event) => updateSelected({ ...selectedStep, instructions: event.target.value })}
                      rows={5}
                      className="mt-1 leading-relaxed"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]">
                      Execution
                      <Select
                        value={selectedStep.execution}
                        onChange={(event) => updateSelected({ ...selectedStep, execution: event.target.value as "ephemeral" | "durable" })}
                        containerClassName="mt-1 flex"
                        controlSize="sm"
                      >
                        <option value="ephemeral">ephemeral</option>
                        <option value="durable">durable</option>
                      </Select>
                    </label>
                    <label className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]">
                      Timeout
                      <Input
                        type="number"
                        min={1}
                        max={240}
                        value={selectedStep.timeoutMinutes}
                        onChange={(event) => updateSelected({ ...selectedStep, timeoutMinutes: Number(event.target.value) })}
                        className="mt-1 font-mono"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 font-ui text-[var(--t-section)] text-[var(--subtext-0)]">
                    <Input
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
                      className="font-mono"
                    />
                  ) : null}
                </>
              ) : null}

              {selectedStep.kind === "condition" ? (
                <>
                  <Textarea
                    value={selectedStep.expr}
                    onChange={(event) => updateSelected({ ...selectedStep, expr: event.target.value })}
                    rows={3}
                    aria-label="Condition expression"
                    className="font-mono"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {(["then", "else"] as const).map((field) => (
                      <label key={field} className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]">
                        {field}
                        <Select
                          value={selectedStep[field]}
                          onChange={(event) => updateSelected({ ...selectedStep, [field]: event.target.value })}
                          containerClassName="mt-1 flex"
                          className="font-mono"
                          controlSize="sm"
                        >
                          {targetOptions.filter((target) => target !== selectedStep.id).map((target) => <option key={target} value={target}>{target}</option>)}
                        </Select>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}

              {selectedStep.kind === "approval" ? (
                <>
                  <Input value={selectedStep.gate} onChange={(event) => updateSelected({ ...selectedStep, gate: event.target.value })} aria-label="Approval gate role" className="font-mono" />
                  <Input value={selectedStep.payloadRef} onChange={(event) => updateSelected({ ...selectedStep, payloadRef: event.target.value })} aria-label="Approval payload reference" className="font-mono" />
                </>
              ) : null}

              {selectedStep.kind === "artifact" ? (
                <>
                  <Select value={selectedStep.action} onChange={(event) => updateSelected({ ...selectedStep, action: event.target.value as typeof selectedStep.action })} aria-label="Artifact action" containerClassName="flex">
                    <option value="create-doc">Create document</option>
                    <option value="revise-doc">Revise document</option>
                    <option value="create-record">Create record</option>
                    <option value="simulate-consequential-action">Simulate consequential action</option>
                  </Select>
                  <Input value={selectedStep.template} onChange={(event) => updateSelected({ ...selectedStep, template: event.target.value })} aria-label="Artifact template" className="font-mono" />
                </>
              ) : null}

              {selectedStep.kind === "decision" ? (
                <Textarea value={selectedStep.rationale} onChange={(event) => updateSelected({ ...selectedStep, rationale: event.target.value })} aria-label="Decision rationale" rows={4} />
              ) : null}

              {selectedStep.kind !== "condition" ? (
                <label className="block font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]">
                  Next
                  <Select
                    value={selectedStep.next ?? ""}
                    onChange={(event) => updateSelected({ ...selectedStep, next: event.target.value || null })}
                    containerClassName="mt-1 flex"
                    className="font-mono"
                    controlSize="sm"
                  >
                    <option value="">terminal</option>
                    {targetOptions.filter((target) => target !== selectedStep.id).map((target) => <option key={target} value={target}>{target}</option>)}
                  </Select>
                </label>
              ) : null}
            </div>
          ) : null}

          {!validation.valid ? (
            <ul className="mt-5 space-y-1 border-t border-[var(--border)] pt-4 font-ui text-[var(--t-count)] text-[var(--danger)]">
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
            <Control variant="quiet" onClick={() => setPendingSave(null)} disabled={saving}>Cancel</Control>
            <Control variant="primary" onClick={() => void confirmSave()} disabled={saving}>
              {saving ? "Saving…" : "Confirm write"}
            </Control>
          </>
        }
      >
        {pendingSave ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Pill variant="neutral">v{pendingSave.definition.version}</Pill>
              <Pill variant={pendingSave.diff.authorityExpanded ? "waiting" : "neutral"}>
                {pendingSave.diff.authorityExpanded ? "Authority expands" : "No authority expansion"}
              </Pill>
              {pendingSave.diff.addedApprovalGates.map((gate) => <Pill key={gate} variant="runtime">+ {gate}</Pill>)}
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--r-ctl)] bg-[var(--crust)] p-3 font-mono text-[var(--t-count)] leading-relaxed text-[var(--subtext-0)]">
              {JSON.stringify(pendingSave.definition, null, 2)}
            </pre>
          </div>
        ) : null}
      </AppDialog>
    </div>
  );
}
