import type { ReactNode } from "react";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Control } from "@/components/ui/control";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowDefinitionV1, WorkflowStep, WorkflowRoleAssignStep } from "@/lib/workflow-schema";

const STEP_LABELS = { "role-assign": "Role assignment", condition: "Condition", approval: "Approval", artifact: "Artifact", decision: "Decision" };
const OUTCOMES = { complete: "Complete", blocked: "Blocked", escalate: "Escalate" };
const ARTIFACT_ACTIONS = { "create-doc": "Create document", "revise-doc": "Revise document", "create-record": "Create record", "simulate-consequential-action": "Simulate action" };
const AUTHORITIES = { "read-only": "Read only", "draft-only": "Draft only", "local-write": "Local write", "room-write": "Room write", "external-action-request": "Request external action" };
const labelClass = "block text-[12px] text-[var(--text-muted)]";
function Disclosure({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  return <details className="border-t border-[var(--border)] pt-2 text-[12px] text-[var(--text-muted)]">
    <summary className="cursor-pointer"><span className="text-[var(--text)]">{label}</span><span className="ml-2 break-words">{summary}</span></summary>
    <div className="mt-2 space-y-2">{children}</div>
  </details>;
}

export function WorkflowStepCard({ step, index, definition, selected, roleTargets, onSelect, onChange, onAskRole, actions, typeEditor, autoFocusTitle = false }: {
  step: WorkflowStep; index: number; definition: WorkflowDefinitionV1; selected: boolean; roleTargets: AgentPanelRoleTarget[]; onSelect: (id: string) => void; onChange: (step: WorkflowStep) => void; onAskRole: (role: string) => void; actions?: ReactNode; typeEditor?: ReactNode; autoFocusTitle?: boolean;
}) {
  const destination = (id: string) => definition.steps.find((candidate) => candidate.id === id)?.title ?? OUTCOMES[id as keyof typeof OUTCOMES] ?? id;
  const targetOptions = [...definition.steps.map((candidate) => candidate.id), ...Object.keys(OUTCOMES)].filter((id) => id !== step.id);
  const role = step.kind === "role-assign" ? roleTargets.find((candidate) => candidate.roleKey === step.role) : undefined;
  const binding = step.kind === "role-assign" && step.resolution === "explicit-agent-override" ? roleTargets.find((candidate) => candidate.agentKey === step.agentOverride) : role;
  const unavailable = step.kind === "role-assign" && roleTargets.length > 0 && (!binding || binding.state !== "ready");
  const owner = step.kind === "role-assign" ? `${role?.roleName ?? step.role.replaceAll("_", " ")}${step.resolution === "explicit-agent-override" ? ` · ${roleTargets.find((candidate) => candidate.agentKey === step.agentOverride)?.agentName ?? step.agentOverride ?? "Agent override"}` : role?.agentName ? ` · ${role.agentName}` : ""}` : step.kind === "approval" ? step.gate.replaceAll("_", " ") : null;
  const result = step.kind === "role-assign" ? "Step result" : step.kind === "condition" ? "Yes / No route" : step.kind === "artifact" ? ARTIFACT_ACTIONS[step.action] : step.kind === "approval" ? "Approval gate" : "Decision record";
  const nextControl = step.kind !== "condition" ? <label className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">Next
    <Select data-workflow-field="next" aria-label={`Next step after ${step.title}`} value={step.next ?? "complete"} onChange={(event) => onChange({ ...step, next: event.target.value === "complete" ? null : event.target.value })} containerClassName="min-w-0 flex-1" controlSize="sm">
      {targetOptions.map((target) => <option key={target} value={target}>{destination(target)}</option>)}
    </Select>
  </label> : null;
  return <Card data-workflow-step={step.id} selected={selected} className={`${selected ? "bg-[color-mix(in_srgb,var(--raised)_50%,var(--base))] hover:bg-[color-mix(in_srgb,var(--raised)_50%,var(--base))] [--input:var(--base)]" : ""}`}>
    <div className={`flex items-start gap-2${selected ? " nodrag nopan" : ""}`}>
      {selected ? <>
        <Input data-workflow-field="title" autoFocus={autoFocusTitle} aria-label={`Title for step ${index + 1}`} value={step.title} onChange={(event) => onChange({ ...step, title: event.target.value })} className="h-8 min-w-0 flex-1 font-medium" />
        <Control size="icon" variant="quiet" onClick={() => onSelect("")} aria-label={`Collapse ${step.title}`}><ChevronDown aria-hidden className="h-3.5 w-3.5" /></Control>
      </> : <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(step.id)} aria-label={`Edit ${step.title}`}>
        <span className="block break-words text-[var(--t-ui)] font-medium">{step.title}</span>
        <span className="mt-1 block text-[12px] text-[var(--text-muted)]">{index + 1} · {STEP_LABELS[step.kind]}</span>
      </button>}
      {actions ? <div className="nodrag nopan">{actions}</div> : null}
    </div>
    {selected ? <div className="nodrag nopan mt-2 space-y-3 cursor-auto">
      <div className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--text-muted)]"><span>{index + 1}</span>{typeEditor ?? <span>{STEP_LABELS[step.kind]}</span>}</div>
      {step.kind === "role-assign" ? <>
        <label className={labelClass}>Role<Select data-workflow-field="role" aria-label={`Role for ${step.title}`} value={step.role} onChange={(event) => { const target = roleTargets.find((candidate) => candidate.roleKey === event.target.value); onChange({ ...step, role: event.target.value, execution: target?.execution ?? step.execution }); }} containerClassName="mt-1 w-full" controlSize="sm">
          {!roleTargets.some((candidate) => candidate.roleKey === step.role) ? <option value={step.role}>{step.role.replaceAll("_", " ")} · unavailable</option> : null}
          {roleTargets.map((candidate) => <option key={candidate.roleKey} value={candidate.roleKey}>{candidate.roleName}{candidate.state === "ready" ? "" : " · unavailable"}</option>)}
        </Select></label>
        <label className={labelClass}>Task<Textarea data-workflow-field="instructions" aria-label={`Instructions for ${step.title}`} value={step.instructions} onChange={(event) => onChange({ ...step, instructions: event.target.value })} rows={2} className="mt-1 h-14 min-h-0 [field-sizing:fixed] text-[var(--t-meta)] leading-5" /></label>
      </> : null}
      {step.kind === "condition" ? <>
        <label className={labelClass}>Expression<Textarea data-workflow-field="expr" aria-label={`Expression for ${step.title}`} value={step.expr} onChange={(event) => onChange({ ...step, expr: event.target.value })} rows={2} className="mt-1 font-mono" /></label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
          {(["then", "else"] as const).map((field) => <label key={field} className={labelClass}>{field === "then" ? "Yes" : "No"}<Select data-workflow-field={field} aria-label={`${field === "then" ? "Yes" : "No"} route for ${step.title}`} value={step[field]} onChange={(event) => onChange({ ...step, [field]: event.target.value })} containerClassName="mt-1 w-full" controlSize="sm">{targetOptions.map((target) => <option key={target} value={target}>{destination(target)}</option>)}</Select></label>)}
        </div>
      </> : null}
      {step.kind === "approval" ? <label className={labelClass}>Gate<Input data-workflow-field="gate" aria-label={`Approval gate for ${step.title}`} value={step.gate} onChange={(event) => onChange({ ...step, gate: event.target.value })} className="mt-1 h-8" /></label> : null}
      {step.kind === "artifact" ? <label className={labelClass}>Action<Select data-workflow-field="action" aria-label={`Action for ${step.title}`} value={step.action} onChange={(event) => onChange({ ...step, action: event.target.value as typeof step.action })} containerClassName="mt-1 w-full" controlSize="sm">{Object.entries(ARTIFACT_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label> : null}
      {step.kind === "decision" ? <label className={labelClass}>Rationale<Textarea data-workflow-field="rationale" aria-label={`Rationale for ${step.title}`} value={step.rationale} onChange={(event) => onChange({ ...step, rationale: event.target.value })} rows={2} className="mt-1" /></label> : null}
      {nextControl}
      {step.kind === "role-assign" ? <Disclosure label="Inputs" summary={step.contextRefs?.length ? `${step.contextRefs.length} context references` : "No context references"}>
        <label className={labelClass}>Context references<Textarea data-workflow-field="contextRefs" aria-label={`Context references for ${step.title}`} value={(step.contextRefs ?? []).join("\n")} onChange={(event) => onChange({ ...step, contextRefs: event.target.value ? event.target.value.split("\n") : [] })} rows={2} className="mt-1 font-mono" /></label>
        <p>One reference per line.</p>
      </Disclosure> : step.kind === "approval" || step.kind === "artifact" ? <Disclosure label="Inputs" summary={step.payloadRef || "No payload reference"}>
        <label className={labelClass}>Payload reference<Input data-workflow-field="payloadRef" aria-label={`Payload for ${step.title}`} value={step.payloadRef ?? ""} onChange={(event) => { if (step.kind === "artifact" && !event.target.value) { const { payloadRef: _payload, ...rest } = step; onChange(rest); } else onChange({ ...step, payloadRef: event.target.value }); }} className="mt-1 h-8 font-mono" /></label>
      </Disclosure> : null}
      <Disclosure label="Output" summary={step.kind === "artifact" ? step.template || "Template required" : result}>
        {step.kind === "artifact" ? <label className={labelClass}>Template<Input data-workflow-field="template" aria-label={`Template for ${step.title}`} value={step.template} onChange={(event) => onChange({ ...step, template: event.target.value })} className="mt-1 h-8 font-mono" /></label> : <p>{step.kind === "condition" ? `Yes → ${destination(step.then)} · No → ${destination(step.else)}` : result}</p>}
      </Disclosure>
      {step.kind === "role-assign" ? <Disclosure label="Controls" summary={`${(step.mediatedAuthority ? AUTHORITIES[step.mediatedAuthority] : "Role authority")} · ${step.verification.required ? `Independent verification${step.verification.method ? `: ${step.verification.method}` : " required"}` : "No independent verification"}`}>
        <label className={labelClass}>May<Select data-workflow-field="mediatedAuthority" aria-label="Step authority" value={step.mediatedAuthority ?? ""} onChange={(event) => onChange({ ...step, mediatedAuthority: (event.target.value || undefined) as WorkflowRoleAssignStep["mediatedAuthority"] })} containerClassName="mt-1 w-full" controlSize="sm"><option value="">Use role authority</option>{Object.entries(AUTHORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <div className="flex flex-wrap items-center gap-2"><Checkbox data-workflow-field="verification.required" aria-label="Independent verification" checked={step.verification.required} onCheckedChange={(checked) => onChange({ ...step, verification: { required: checked, method: checked ? step.verification.method ?? "" : null } })} /><span>Independent verification</span></div>
        {step.verification.required ? <Input data-workflow-field="verification.method" aria-label="Verification method" value={step.verification.method ?? ""} onChange={(event) => onChange({ ...step, verification: { required: true, method: event.target.value } })} placeholder="Verification method" className="h-8 font-mono" /> : null}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2"><label className={labelClass}>Execution<Select data-workflow-field="execution" aria-label={`Execution for ${step.title}`} value={step.execution} onChange={(event) => onChange({ ...step, execution: event.target.value as "ephemeral" | "durable" })} containerClassName="mt-1 w-full" controlSize="sm"><option value="ephemeral">ephemeral</option><option value="durable">durable</option></Select></label><label className={labelClass}>Timeout (minutes)<Input data-workflow-field="timeoutMinutes" aria-label={`Timeout for ${step.title}`} type="number" min={1} max={240} value={step.timeoutMinutes} onChange={(event) => onChange({ ...step, timeoutMinutes: Number(event.target.value) })} className="mt-1 h-8 font-mono" /></label></div>
        <Control size="sm" variant="quiet" onClick={() => onAskRole(step.role)}><MessageSquareText aria-hidden className="h-3.5 w-3.5" />Ask role</Control>
      </Disclosure> : null}
    </div> : <p className="mt-2 break-words text-[12px] text-[var(--text-muted)]">{owner ? `${owner}${unavailable ? " · unavailable" : ""} · ` : ""}{result}</p>}
  </Card>;
}
