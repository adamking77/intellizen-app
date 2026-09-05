import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Control } from "@/components/ui/control";
import { Select } from "@/components/ui/select";
import type { DesignerStepKind } from "@/lib/workflow-designer";
import type { WorkflowDefinitionV1, WorkflowStep } from "@/lib/workflow-schema";

const STEP_KINDS: Array<{ id: DesignerStepKind; label: string }> = [
  { id: "role-assign", label: "Role assignment" },
  { id: "condition", label: "Condition" },
  { id: "approval", label: "Approval" },
  { id: "artifact", label: "Artifact" },
  { id: "decision", label: "Decision" },
];
function kindOptions(hasPrevious: boolean, current?: DesignerStepKind) {
  return STEP_KINDS.map(({ id, label }) => {
    const unavailable = !hasPrevious && id !== current && (id === "condition" || id === "approval");
    return <option key={id} value={id} disabled={unavailable}>{label}{unavailable ? " · needs a prior step" : ""}</option>;
  });
}

/** An untyped placeholder is editing UI; only choosing a type changes the draft. */
export function WorkflowStepInsertion({ label, hasPrevious, onAdd }: { label: string; hasPrevious: boolean; onAdd: (kind: DesignerStepKind) => void }) {
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (open) { picker.current?.scrollIntoView?.({ block: "nearest" }); picker.current?.focus({ preventScroll: true }); }
    else if (returnFocus.current) { returnFocus.current = false; trigger.current?.focus({ preventScroll: true }); }
  }, [open]);
  function cancel() { returnFocus.current = true; setOpen(false); }
  if (!open) return <div className="flex h-8 items-center justify-center"><Control ref={trigger} size="icon" variant="quiet" aria-label={label} onClick={() => setOpen(true)}><Plus aria-hidden className="h-3.5 w-3.5" /></Control></div>;
  return <Card className="my-3 border border-[var(--border-strong)]" role="group" aria-label="New workflow step" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[var(--t-ui)] font-medium">New step</p><Control size="sm" variant="quiet" onClick={cancel}>Cancel</Control></div>
    <Select ref={picker} aria-label="New step type" value="" containerClassName="w-full" onChange={(event) => { onAdd(event.target.value as DesignerStepKind); setOpen(false); }}><option value="" disabled>Choose step type…</option>{kindOptions(hasPrevious)}</Select>
  </Card>;
}

export function WorkflowStepTypePicker({ step, definition, onChange }: { step: WorkflowStep; definition: WorkflowDefinitionV1; onChange: (kind: DesignerStepKind, branch?: "then" | "else") => void }) {
  const [pending, setPending] = useState<DesignerStepKind | null>(null);
  const picker = useRef<HTMLSelectElement>(null);
  const hasPrevious = definition.steps[0]?.id !== step.id && definition.steps.some((candidate) => candidate.id !== step.id && (candidate.kind === "condition" ? candidate.then === step.id || candidate.else === step.id : candidate.next === step.id));
  useEffect(() => setPending(null), [step.id, step.kind]);
  function choose(kind: DesignerStepKind) {
    if (kind === step.kind) { setPending(null); return; }
    if (step.kind === "condition" && step.then !== step.else) setPending(kind);
    else onChange(kind);
  }
  const destination = (id: string) => definition.steps.find((candidate) => candidate.id === id)?.title ?? ({ complete: "Complete", blocked: "Blocked", escalate: "Escalate" }[id] ?? id);
  return <div className="nodrag nopan min-w-0 flex-1">
    <Select data-workflow-field="kind" ref={picker} className="text-[12px]" aria-label={`Step type for ${step.title}`} value={pending ?? step.kind} controlSize="sm" containerClassName="w-full" onChange={(event) => choose(event.target.value as DesignerStepKind)}>{kindOptions(hasPrevious, step.kind)}</Select>
    {pending && step.kind === "condition" ? <div className="mt-2 space-y-2 text-[var(--t-count)]" role="group" aria-label="Choose the route to keep">
      <p>Choose the route to keep. The other branch’s steps remain available.</p>
      {(["then", "else"] as const).map((branch) => <Control key={branch} size="sm" variant="quiet" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => { onChange(pending, branch); setPending(null); picker.current?.focus(); }}>{branch === "then" ? "Yes" : "No"} → {destination(step[branch])}</Control>)}
      <Control size="sm" variant="quiet" onClick={() => { setPending(null); picker.current?.focus(); }}>Cancel type change</Control>
    </div> : null}
  </div>;
}
