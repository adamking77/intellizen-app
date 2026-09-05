import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, X, Undo2, Redo2 } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Control } from "@/components/ui/control";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { WorkflowChangeReview } from "./workflow-change-review";
import { workflowIssueTarget } from "@/lib/workflow-editor-navigation";
import { WorkflowStepInsertion, WorkflowStepTypePicker } from "./workflow-step-type";
import { WorkflowStepCard } from "./workflow-step-card";
import { WorkflowComposerCanvas } from "./workflow-composer-canvas";
import { WorkflowProposalPreview } from "./workflow-proposal-preview";
import { WorkflowActionMenu, type WorkflowMenuAction } from "./workflow-action-menu";
import { recoverWorkflowComposerPositions, storeWorkflowComposerPositions, connectWorkflowComposer, duplicateWorkflowComposerStep, removeWorkflowComposerStep, type WorkflowComposerSnapshot, type WorkflowNodePositions, type WorkflowDraftProposal } from "@/lib/workflow-composer";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import { publishAgentPanelRoleMessage } from "@/lib/agent-panel-roles";
import { createWorkflowDraft } from "@/lib/workflow-records";
import { errorMessage } from "@/lib/toast";
import { saveWorkflowDefinition } from "@/lib/data";
import type { WorkflowTemplateItem } from "@/lib/types";
import {
  addWorkflowDesignerStep,
  changeWorkflowDesignerStepKind,
  clearWorkflowDesignerDraft,
  recoverWorkflowDesignerDraft,
  storeWorkflowDesignerDraft,
  createWorkflowDesignerDraft,
  updateWorkflowDesignerStep,
  type DesignerStepKind,
  type WorkflowInsertion,
} from "@/lib/workflow-designer";
import {
  dryRunWorkflowDefinition,
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
  type WorkflowRoleResolution,
  type WorkflowStep,
} from "@/lib/workflow-schema";
import { cn } from "@/lib/utils";

type DesignerSurface = "steps" | "canvas";
const DESIGNER_SURFACES = [
  { value: "canvas" as const, label: "Canvas" },
  { value: "steps" as const, label: "Steps" },
];

interface PendingSave {
  definition: WorkflowDefinitionV1;
  activate: boolean;
}

export function WorkflowDesigner({
  workflow,
  roleTargets,
  initialDefinition = null,
  onClose,
  onSaved,
  onDraftWithAgent,
  onDirtyChange,
  embedded = false,
  initialSurface = "canvas",
  proposal = null,
  draftRevision,
  onDraftChange,
  onProposalApplied,
  onProposalDismissed,
  runsTray,
  onBack,
  runControl,
  workflowActions = [],
}: {
  workflow: WorkflowTemplateItem;
  roleTargets: AgentPanelRoleTarget[];
  initialDefinition?: WorkflowDefinitionV1 | null;
  onClose?: () => void;
  onSaved: (workflow?: WorkflowTemplateItem) => void;
  onDraftWithAgent: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  embedded?: boolean;
  initialSurface?: DesignerSurface;
  proposal?: WorkflowDraftProposal | null;
  draftRevision?: string | null;
  onDraftChange?: (definition: WorkflowDefinitionV1, selectedStepId: string) => void;
  onProposalApplied?: (id: string) => void;
  onProposalDismissed?: (id: string) => void;
  runsTray?: ReactNode;
  onBack?: () => void;
  runControl?: ReactNode;
  workflowActions?: WorkflowMenuAction[];
}) {
  const recoveryKey = workflow.id || workflow.workflow_id;
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
  const recoveredDraft = useMemo(() => {
    const recovered = recoverWorkflowDesignerDraft(recoveryKey);
    if (workflow.id && recovered && JSON.stringify(recovered.definition) === JSON.stringify(initialDraft)) { clearWorkflowDesignerDraft(recoveryKey); return null; }
    return recovered;
  }, [recoveryKey, initialDraft]);
  const [definition, setDefinition] = useState<WorkflowDefinitionV1>(() => recoveredDraft?.definition ?? initialDraft);
  const [selectedStepId, setSelectedStepId] = useState(initialSurface === "steps" ? definition.steps[0]?.id ?? "" : "");
  const [dryRun, setDryRun] = useState<ReturnType<typeof dryRunWorkflowDefinition> | null>(null);
  const [surface, setSurface] = useState<DesignerSurface>(initialSurface);
  const [positions, setPositions] = useState<WorkflowNodePositions>(() => recoveredDraft?.positions ?? recoverWorkflowComposerPositions(recoveryKey));
  const [history, setHistory] = useState<{ past: WorkflowComposerSnapshot[]; future: WorkflowComposerSnapshot[] }>({ past: [], future: [] });
  const [tray, setTray] = useState<"tests" | "runs" | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [dirty, setDirty] = useState(() => Boolean(recoveredDraft));
  const [replaceInvalid, setReplaceInvalid] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(() => recoveredDraft?.baseUpdatedAt ?? workflow.updated_at);
  const identity = useRef(recoveryKey);
  const designerHost = useRef<HTMLDivElement>(null);
  const canvasViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const [repairTarget, setRepairTarget] = useState<ReturnType<typeof workflowIssueTarget> | null>(null);
  function repairIssue(path: string) {
    const target = workflowIssueTarget(definition, path);
    setSelectedStepId(target.stepId);
    setRepairTarget(target);
  }
  useEffect(() => {
    if (!repairTarget) return;
    const timer = setTimeout(() => {
      const scope = repairTarget.stepId
        ? [...(designerHost.current?.querySelectorAll<HTMLElement>("[data-workflow-step]") ?? [])].find((element) => element.dataset.workflowStep === repairTarget.stepId)
        : designerHost.current;
      const fields = [...(scope?.querySelectorAll<HTMLElement>("[data-workflow-field]") ?? [])];
      const field = fields.find((element) => element.dataset.workflowField === repairTarget.field)
        ?? fields.find((element) => element.dataset.workflowField === repairTarget.field.split(/[.\[]/)[0])
        ?? scope?.querySelector<HTMLElement>("input,select,textarea,button");
      for (let parent = field?.parentElement; parent && parent !== scope; parent = parent.parentElement) if (parent.tagName === "DETAILS") (parent as HTMLDetailsElement).open = true;
      field?.focus({ preventScroll: surface === "canvas" });
      if (surface === "steps") field?.scrollIntoView?.({ block: "nearest" });
      setRepairTarget(null);
    }, 140);
    return () => clearTimeout(timer);
  }, [repairTarget, surface]);
  function issueList(errors: { path: string; code: string; message: string }[]) {
    return <ul className="space-y-1 text-[var(--t-meta)]">{errors.map((error) => <li key={`${error.path}-${error.code}`}><button className="text-left underline-offset-2 hover:underline" onClick={() => repairIssue(error.path)}>{workflowIssueTarget(definition, error.path).label}: {error.message}</button></li>)}</ul>;
  }
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (dirty) storeWorkflowDesignerDraft(recoveryKey, { definition, baseUpdatedAt, positions, positionsVersion: 2 }); }, [recoveryKey, dirty, definition, baseUpdatedAt, positions]);
  useEffect(() => { onDraftChange?.(definition, selectedStepId); }, [definition, selectedStepId, onDraftChange]);
  const conflict = Boolean(workflow.id && dirty && baseUpdatedAt !== workflow.updated_at);

  useEffect(() => {
    if (identity.current === recoveryKey && dirty) return;
    identity.current = recoveryKey;
    const recovered = recoveredDraft;
    const next = recovered?.definition ?? initialDraft;
    setDefinition(next);
    setSelectedStepId(initialSurface === "steps" ? next.steps[0]?.id ?? "" : "");
    setPositions(recovered?.positions ?? recoverWorkflowComposerPositions(recoveryKey));
    setHistory({ past: [], future: [] });
    setBaseUpdatedAt(recovered?.baseUpdatedAt ?? workflow.updated_at);
    setDirty(Boolean(recovered));
    setReplaceInvalid(false);
    setDryRun(null);
    setFailure(null);
  }, [initialDraft, recoveryKey, workflow.updated_at]);

  useEffect(() => {
    publishAgentPanelRoleMessage({ collapsed: true });
  }, []);

  const validation = validateWorkflowDefinition(definition);
  const selectedStep = definition.steps.find((step) => step.id === selectedStepId);
  function commit(next: WorkflowDefinitionV1, nextPositions = positions) {
    if (JSON.stringify(next) === JSON.stringify(definition) && JSON.stringify(nextPositions) === JSON.stringify(positions)) return;
    setHistory((current) => ({ past: [...current.past.slice(-49), structuredClone({ definition, positions })], future: [] }));
    setDefinition(next);
    setPositions(nextPositions);
    storeWorkflowComposerPositions(recoveryKey, nextPositions);
    if (JSON.stringify(next) !== JSON.stringify(definition)) setDirty(true);
    setDryRun(null);
    setFailure(null);
  }
  function undo() {
    const previous = history.past.at(-1); if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [structuredClone({ definition, positions }), ...history.future] });
    setDefinition(previous.definition); setPositions(previous.positions); storeWorkflowComposerPositions(recoveryKey, previous.positions); setDirty((current) => current || JSON.stringify(previous.definition) !== JSON.stringify(definition)); setDryRun(null);
  }
  function redo() {
    const next = history.future[0]; if (!next) return;
    setHistory({ past: [...history.past, structuredClone({ definition, positions })], future: history.future.slice(1) });
    setDefinition(next.definition); setPositions(next.positions); storeWorkflowComposerPositions(recoveryKey, next.positions); setDirty((current) => current || JSON.stringify(next.definition) !== JSON.stringify(definition)); setDryRun(null);
  }
  function connect(source: string, target: string, handle: "next" | "then" | "else") {
    try { commit(connectWorkflowComposer(definition, source, target, handle)); } catch (error) { setFailure(errorMessage(error)); }
  }
  function duplicate() {
    if (!selectedStep) return;
    const next = duplicateWorkflowComposerStep(definition, selectedStep.id);
    const added = next.steps.find((step) => !definition.steps.some((existing) => existing.id === step.id));
    commit(next); if (added) setSelectedStepId(added.id);
  }
  function remove() {
    if (!selectedStep) return;
    try { commit(removeWorkflowComposerStep(definition, selectedStep.id)); setSelectedStepId(""); } catch (error) { setFailure(errorMessage(error)); }
  }

  function updateSelected(step: WorkflowStep) {
    commit(updateWorkflowDesignerStep(definition, step));
  }

  function addStep(kind: DesignerStepKind, location?: WorkflowInsertion) {
    try {
      const next = addWorkflowDesignerStep(definition, kind, location);
      const added = next.steps.find((step) => !definition.steps.some((prior) => prior.id === step.id));
      commit(next);
      if (added) setSelectedStepId(added.id);
    } catch (error) { setFailure(errorMessage(error)); }
  }

  function changeStepKind(step: WorkflowStep, kind: DesignerStepKind, branch?: "then" | "else") {
    try { commit(changeWorkflowDesignerStepKind(definition, step.id, kind, branch)); }
    catch (error) { setFailure(errorMessage(error)); }
  }

  function askRole(roleKey: string) {
    publishAgentPanelRoleMessage({ roleKey, open: true });
  }

  function runDryRun() {
    setTray("tests");
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
    if (saving || conflict) return;
    const candidate = { ...definition, version: workflow.id && existingDefinition ? Math.max(existingDefinition.version, definition.version) + 1 : 1 };
    if (!validateWorkflowDefinition(candidate).valid) return;
    setSaving(true);
    setFailure(null);
    try {
      if (workflow.id) await saveWorkflowDefinition({ workflowRecordId: workflow.id, definition: candidate, activate, confirmWrite: false, expectedUpdatedAt: baseUpdatedAt });
      setPendingSave({ definition: candidate, activate });
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setSaving(false); }
  }

  async function confirmSave() {
    if (!pendingSave || saving || conflict) return;
    setSaving(true);
    setFailure(null);
    try {
      if (!workflow.id) {
        const created = await createWorkflowDraft(pendingSave.definition);
        setPendingSave(null);
        clearWorkflowDesignerDraft(recoveryKey);
        setDirty(false);
        storeWorkflowComposerPositions(created.id, positions);
        onSaved(created);
      } else {
        const saved = await saveWorkflowDefinition({ workflowRecordId: workflow.id, definition: pendingSave.definition, activate: pendingSave.activate, confirmWrite: true, expectedUpdatedAt: baseUpdatedAt });
        setDefinition(pendingSave.definition);
        if ("workflow" in saved && saved.workflow) setBaseUpdatedAt(saved.workflow.updated_at);
        setPendingSave(null);
        clearWorkflowDesignerDraft(recoveryKey);
        setDirty(false);
        onSaved();
      }
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setSaving(false); }
  }

  function stepCard(step: WorkflowStep, index: number) {
    return <WorkflowStepCard autoFocusTitle={surface === "steps"} typeEditor={selectedStepId === step.id ? <WorkflowStepTypePicker step={step} definition={definition} onChange={(kind, branch) => changeStepKind(step, kind, branch)} /> : undefined} step={step} index={index} definition={definition} selected={selectedStepId === step.id} roleTargets={roleTargets} onSelect={setSelectedStepId} onChange={updateSelected} onAskRole={askRole} actions={selectedStepId === step.id ? <WorkflowActionMenu label={`Actions for ${step.title}`} actions={[
      { label: "Duplicate step", onSelect: duplicate },
      ...(definition.steps[0]?.id !== step.id ? [{ label: "Start here", onSelect: () => commit({ ...definition, steps: [step, ...definition.steps.filter((item) => item.id !== step.id)] }) }] : []),
      { label: step.kind === "condition" ? "Remove step · keep Yes branch" : "Remove step", onSelect: remove, danger: true },
    ]} /> : undefined} />;
  }

  const rendered = new Set<string>();
  function renderFlow(target: string | null): React.ReactNode {
    const step = definition.steps.find((candidate) => candidate.id === target);
    if (!step) return <p className="py-2 text-center text-[var(--t-meta)] text-[var(--text-muted)]">{target === "blocked" ? "Blocked" : target === "escalate" ? "Escalate" : target && target !== "complete" ? target : "Complete"}</p>;
    if (rendered.has(step.id)) return <Control size="sm" variant="quiet" onClick={() => { setSelectedStepId(step.id); document.getElementById(`workflow-step-${step.id}`)?.scrollIntoView({ block: "nearest" }); }}>Continue at {step.title}</Control>;
    rendered.add(step.id);
    return <div key={step.id} id={`workflow-step-${step.id}`} className="min-w-0 scroll-mt-4">
      {stepCard(step, definition.steps.indexOf(step))}
      {step.kind === "condition" ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3 pt-3 max-[700px]:grid-cols-1">
        {(["then", "else"] as const).map((branch) => <div key={branch} className="min-w-0 border-t border-[var(--border)] pt-2">
          <p className="text-[var(--t-meta)] text-[var(--text-muted)]">{branch === "then" ? "Yes" : "No"}</p><WorkflowStepInsertion label={`Insert on ${branch === "then" ? "Yes" : "No"} branch of ${step.title}`} hasPrevious onAdd={(kind) => addStep(kind, { afterStepId: step.id, branch })} />
          {renderFlow(step[branch])}
        </div>)}
      </div> : <><WorkflowStepInsertion label={`Insert after ${step.title}`} hasPrevious onAdd={(kind) => addStep(kind, { afterStepId: step.id })} />{renderFlow(step.next)}</>}
    </div>;
  }

  const inputsEditor = (<div className="nodrag nopan mt-2 grid gap-2 cursor-auto">
              {definition.inputs.map((input, index) => <div key={index} className="space-y-1">
                <Input data-workflow-field={`inputs[${index}].key`} aria-label={`Input ${index + 1} name`} value={input.key} onChange={(event) => commit({ ...definition, inputs: definition.inputs.map((entry, i) => i === index ? { ...entry, key: event.target.value } : entry) })} />
                <Select data-workflow-field={`inputs[${index}].type`} aria-label={`Input ${index + 1} type`} value={input.type} onChange={(event) => commit({ ...definition, inputs: definition.inputs.map((entry, i) => i === index ? { ...entry, type: event.target.value as typeof input.type } : entry) })}>{["string", "number", "boolean", "record-ref", "document-ref", "json"].map((type) => <option key={type}>{type}</option>)}</Select>
                {input.type === "record-ref" ? <Input data-workflow-field={`inputs[${index}].database`} aria-label={`Input ${index + 1} database`} placeholder="Database ID (optional)" value={input.database ?? ""} onChange={(event) => commit({ ...definition, inputs: definition.inputs.map((entry, i) => i === index ? { ...entry, database: event.target.value || undefined } : entry) })} /> : null}
                <Control size="sm" variant="quiet" onClick={() => commit({ ...definition, inputs: definition.inputs.filter((_, i) => i !== index) })}>Remove input</Control>
              </div>)}
              <Control size="sm" onClick={() => commit({ ...definition, inputs: [...definition.inputs, { key: `input_${definition.inputs.length + 1}`, type: "string" }] })}>Add input</Control>
            </div>);
  const triggerEditor = <div data-workflow-step="trigger" className="space-y-3 rounded-[var(--r-ctl)] bg-[color-mix(in_srgb,var(--raised)_50%,var(--base))] p-3"><h3 className="text-[var(--t-meta)] font-medium">Trigger and inputs</h3><Select containerClassName="nodrag nopan" data-workflow-field="trigger.kind" aria-label="Workflow trigger" value={definition.trigger.kind} onChange={(event) => commit({ ...definition, trigger: { kind: event.target.value as "manual" | "panel-message" } })}><option value="manual">Start manually</option><option value="panel-message">Panel message</option></Select>{inputsEditor}</div>;

  const editingTools = <>
    <Control size="sm" variant="quiet" onClick={onDraftWithAgent}>Draft with an agent</Control>
    <div className="ml-auto flex items-center gap-1">
      <Segmented value={surface} options={DESIGNER_SURFACES} onValueChange={setSurface} label="Definition view" />
      <Control size="icon" variant="quiet" aria-label="Undo workflow edit" title="Undo · ⌘Z" disabled={!history.past.length} onClick={undo}><Undo2 className="h-3.5 w-3.5" /></Control>
      <Control size="icon" variant="quiet" aria-label="Redo workflow edit" title="Redo · ⇧⌘Z" disabled={!history.future.length} onClick={redo}><Redo2 className="h-3.5 w-3.5" /></Control>
    </div>
  </>;

  if (workflow.definition != null && !existingDefinition && !replaceInvalid) {
    return <section className="space-y-3 p-4">{onBack ? <Control size="sm" onClick={onBack}>Back to workflows</Control> : null}<p role="alert" className="text-[var(--warning)]">This saved definition needs repair. The original is preserved below.</p><ul className="text-[var(--t-meta)]">{validateWorkflowDefinition(workflow.definition).errors.map((error) => <li key={`${error.path}-${error.code}`}>{error.path}: {error.message}</li>)}</ul><details><summary>Original definition</summary><pre className="whitespace-pre-wrap break-words text-[var(--t-count)]">{JSON.stringify(workflow.definition, null, 2)}</pre></details><Control onClick={() => { setReplaceInvalid(true); setDirty(true); }}>Start a replacement draft</Control><p className="text-[var(--t-count)] text-[var(--text-muted)]">The original will only be replaced if you save the new version.</p></section>;
  }
  return (
    <div ref={designerHost} className="workflow-designer flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--base)]" onKeyDown={(event) => {
      if (surface !== "steps" || event.defaultPrevented || (event.target as HTMLElement).closest("input,textarea,select,[contenteditable='true']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selectedStepId !== "trigger") { event.preventDefault(); duplicate(); }
      if (event.key === "Escape") setSelectedStepId("");
    }}>
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        {onBack ? <Control size="icon" variant="quiet" onClick={onBack} aria-label="Back to workflows" title="Back to workflows"><ArrowLeft className="h-4 w-4" /></Control> : null}
        <div className="min-w-28 flex-1">
          {embedded ? <Input data-workflow-field="name" aria-label="Workflow name" value={definition.name} onChange={(event) => commit({ ...definition, name: event.target.value })} className="h-7 font-medium" /> : <p className="truncate font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">{definition.name}</p>}
          <p className="mt-0.5 text-[var(--t-count)] text-[var(--text-muted)]">{dirty ? "Local edits retained" : !workflow.id ? "Local draft" : workflow.status === "Active" ? "Active workflow" : "Draft workflow"}{!embedded ? ` · editing v${definition.version}` : ""}</p>
        </div>
        <Control size="sm" variant="primary" onClick={() => void beginSave(false)} disabled={!validation.valid || saving || conflict}>{workflow.status === "Active" && existingDefinition ? "Save version" : "Save draft"}</Control>
        {runControl}
        <WorkflowActionMenu label="Workflow actions" actions={[
          ...(workflow.id && (workflow.status !== "Active" || !existingDefinition) ? [{ label: "Activate…", disabled: !validation.valid || saving || conflict, onSelect: () => void beginSave(true) }] : []),
          { label: "Validate workflow", onSelect: runDryRun },
          ...workflowActions,
        ]} />
        {onClose ? <Control size="icon" variant="quiet" onClick={onClose} aria-label="Close designer"><X className="h-4 w-4" /></Control> : null}
      </header>

      {proposal ? <WorkflowProposalPreview proposal={proposal} definition={definition} draftRevision={draftRevision} onApply={() => { commit(structuredClone(proposal.definition)); onProposalApplied?.(proposal.id); }} onDismiss={onProposalDismissed ? () => onProposalDismissed(proposal.id) : undefined} /> : null}
      {!validation.valid ? <details className="max-h-36 shrink-0 overflow-y-auto px-3 py-2 text-[var(--danger)]"><summary>{validation.errors.length} definition issues prevent saving</summary>{issueList(validation.errors)}</details> : null}
      {failure ? <p role="alert" className="px-3 py-2 text-[var(--danger)]">{failure}</p> : null}
      {conflict ? <div role="alert" className="p-3 text-[var(--warning)]">This workflow changed while you were editing. Your edits are still here. <Control onClick={() => { clearWorkflowDesignerDraft(recoveryKey); setDirty(false); setDefinition(initialDraft); setBaseUpdatedAt(workflow.updated_at); }}>Discard edits and reload</Control></div> : null}
      {!embedded ? <label className="flex items-center gap-3 px-3 py-2 text-[var(--t-meta)]">Name<Input data-workflow-field="name" aria-label="Workflow name" value={definition.name} onChange={(event) => commit({ ...definition, name: event.target.value })} className="max-w-lg" /></label> : null}
      {surface === "steps" ? <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">{editingTools}</div> : null}
      {surface === "steps" ? <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <main className="mx-auto max-w-xl">
          {triggerEditor}
            <WorkflowStepInsertion label="Add first workflow step" hasPrevious={false} onAdd={(kind) => addStep(kind, { afterStepId: null })} />
            {renderFlow(definition.steps[0]?.id ?? null)}
            {definition.steps.filter((step) => !rendered.has(step.id)).map((step) => <div key={step.id} className="mt-4"><p className="mb-2 text-[var(--warning)]">Unconnected step</p>{renderFlow(step.id)}</div>)}
        </main>
      </div> : <WorkflowComposerCanvas initialViewport={canvasViewport.current} onViewportChange={(viewport) => { canvasViewport.current = viewport; }} toolbarContent={editingTools} definition={definition} selectedStepId={selectedStepId} positions={positions} roleTargets={roleTargets} renderStep={stepCard} renderTrigger={triggerEditor} onSelect={setSelectedStepId} onPositions={(next) => commit(definition, next)} onConnect={connect} onAdd={addStep} onDuplicate={duplicate} onRemove={remove} onUndo={undo} onRedo={redo} />}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--mantle)]">
        <div className="flex items-center gap-2 px-3 py-1"><Control size="sm" variant="quiet" onClick={() => { if (tray === "tests") setTray(null); else if (dryRun) setTray("tests"); else runDryRun(); }}>Test results{dryRun ? ` · ${dryRun.errors.length ? `${dryRun.errors.length} issues` : "passed"}` : ""}</Control>{runsTray ? <Control size="sm" variant="quiet" onClick={() => setTray(tray === "runs" ? null : "runs")}>Runs</Control> : null}<span className="ml-auto text-[var(--t-count)] text-[var(--text-muted)]">{definition.steps.length} steps · {validation.valid ? "Valid draft" : `${validation.errors.length} issues`}</span>{tray ? <Control size="sm" variant="quiet" onClick={() => setTray(null)}>Close tray</Control> : null}</div>
        {tray ? <div className="max-h-[min(16rem,35vh)] overflow-auto border-t border-[var(--border)] p-4">{tray === "runs" ? runsTray : dryRun ? <section><p className={cn("mb-3 text-[var(--t-meta)]", dryRun.valid ? "text-[var(--text-muted)]" : "text-[var(--warning)]")}>{dryRun.valid ? "Definition and role checks passed. No work was dispatched." : "Dry run found issues. No work was dispatched."}</p><ol className="space-y-2 text-[var(--t-meta)]">{dryRun.sequence.map((entry, index) => { const value = entry as Record<string, unknown>; return <li key={index}>{definition.steps.find((step) => step.id === value.stepId)?.title ?? String(value.stepId ?? index + 1)}{typeof value.role === "string" ? ` · ${value.role.replaceAll("_", " ")}` : ""}</li>; })}</ol>{dryRun.errors.length ? <div className="mt-3 text-[var(--danger)]">{issueList(dryRun.errors)}</div> : null}</section> : null}</div> : null}
      </div>

      <AppDialog
        open={pendingSave !== null}
        initialFocus="title"
        onOpenChange={(open) => {
          if (!open && !saving) setPendingSave(null);
        }}
        title={pendingSave?.activate ? "Activate workflow version?" : "Save workflow version?"}
        description={pendingSave?.activate || (workflow.status === "Active" && existingDefinition) ? "Future runs will use this version. Runs already in progress retain their saved definition." : "This saves a draft. It will not run until you activate it."}
        footer={
          <>
            <Control variant="quiet" onClick={() => setPendingSave(null)} disabled={saving}>Cancel</Control>
            <Control variant="primary" onClick={() => void confirmSave()} disabled={saving || conflict}>
              {saving ? "Saving…" : pendingSave?.activate ? "Activate version" : "Save"}
            </Control>
          </>
        }
      >
        {pendingSave ? (
          <div className="space-y-3">
            {failure ? <p role="alert" className="text-[var(--danger)]">{failure}</p> : null}
            <WorkflowChangeReview before={workflow.id ? existingDefinition : null} after={pendingSave.definition} />
          </div>
        ) : null}
      </AppDialog>
    </div>
  );
}
