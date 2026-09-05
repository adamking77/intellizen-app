import { workflowAuthorityDiff } from "@/lib/workflow-designer";
import type { WorkflowDefinitionV1, WorkflowStep } from "@/lib/workflow-schema";

const labels: Record<string, string> = {
  schema: "Definition format", id: "Workflow identifier", version: "Version", name: "Name",
  trigger: "Trigger", inputs: "Inputs", kind: "Step type", title: "Title", role: "Assigned role",
  resolution: "Agent selection", agentOverride: "Assigned agent", overrideReason: "Assignment reason",
  modelOverride: "Model", instructions: "Instructions", contextRefs: "Context sources",
  execution: "Session", mediatedAuthority: "Authority", verification: "Verification",
  timeoutMinutes: "Timeout", next: "Next", expr: "Condition", then: "Yes route", else: "No route",
  gate: "Approval role", payloadRef: "Payload source", action: "Action", template: "Template",
  rationale: "Rationale", required: "Required", method: "Method", key: "Name", type: "Type", database: "Database",
};
const names: Record<string, string> = {
  manual: "Start manually", "panel-message": "Panel message", "role-assign": "Role assignment",
  condition: "Condition", approval: "Approval", artifact: "Artifact", decision: "Decision",
  "primary-active-occupant": "Current role occupant", "explicit-agent-override": "Specific agent",
  ephemeral: "New session", durable: "Persistent session", "read-only": "Read only", "draft-only": "Draft only",
  "local-write": "Write locally", "room-write": "Write in the room", "external-action-request": "Request external action",
  "create-doc": "Create document", "revise-doc": "Revise document", "create-record": "Create record",
  "simulate-consequential-action": "Simulate action", complete: "Complete", blocked: "Blocked", escalate: "Escalate",
  "record-ref": "Record reference", "document-ref": "Document reference", json: "Structured data",
};
const readableName = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const fieldLabel = (key: string) => labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());

function displayValue(key: string, value: unknown, definition: WorkflowDefinitionV1): string {
  if (["next", "then", "else", "entry"].includes(key)) return value == null ? "Complete" : definition.steps.find((step) => step.id === value)?.title ?? names[String(value)] ?? String(value);
  if (value == null || value === "") return key === "mediatedAuthority" ? "Use role authority" : "Not set";
  if (key === "trigger" && typeof value === "object") return names[(value as { kind: string }).kind] ?? (value as { kind: string }).kind;
  if (key === "timeoutMinutes") return `${value} minutes`;
  if (key === "verification" && typeof value === "object") {
    const policy = value as { required?: boolean; method?: string | null };
    return policy.required ? `Independent verification required${policy.method ? ` · ${policy.method}` : " · method not set"}` : "Independent verification not required";
  }
  if (Array.isArray(value)) return value.length ? value.map((entry) => displayValue("item", entry, definition)).join("\n") : "None";
  if (typeof value === "object") return Object.entries(value).map(([field, entry]) => `${fieldLabel(field)}: ${displayValue(field, entry, definition)}`).join(" · ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (["role", "gate"].includes(key)) return readableName(String(value));
  // Instructions, titles, expressions and source references stay verbatim.
  return ["kind", "type", "execution", "mediatedAuthority", "resolution", "action"].includes(key) ? names[String(value)] ?? String(value) : String(value);
}

type ReviewField = { label: string; before?: string; after: string };
type ReviewGroup = { title: string; fields: ReviewField[] };

export function workflowReviewChanges(before: WorkflowDefinitionV1 | null | undefined, after: WorkflowDefinitionV1): ReviewGroup[] {
  const groups: ReviewGroup[] = [];
  const fields = (previous: Record<string, unknown> | undefined, next: Record<string, unknown>, keys: string[]) => keys.flatMap((key): ReviewField[] => {
    if (previous && JSON.stringify(previous[key]) === JSON.stringify(next[key])) return [];
    return [{ label: fieldLabel(key), ...(previous ? { before: displayValue(key, previous[key], before!) } : {}), after: displayValue(key, next[key], after) }];
  });
  const metadata = fields(before ?? undefined, after, ["name", "version", "trigger", "inputs", ...(before ? ["schema", "id"] : [])]);
  if (metadata.length) groups.push({ title: before ? "Workflow" : "New workflow", fields: metadata });
  for (const step of after.steps) {
    const previous = before?.steps.find((candidate) => candidate.id === step.id);
    const changes = fields(previous, step, [...new Set([...Object.keys(previous ?? {}), ...Object.keys(step)])].filter((key) => key !== "id"));
    if (changes.length) groups.push({ title: previous ? step.title : `Add ${step.title}`, fields: changes });
  }
  for (const step of before?.steps ?? []) {
    if (!after.steps.some((candidate) => candidate.id === step.id)) groups.push({ title: `Remove ${step.title}`, fields: [{ label: "Step", before: names[step.kind], after: "Removed from this workflow" }] });
  }
  if (before && before.steps[0]?.id !== after.steps[0]?.id) groups.push({ title: "Starting step", fields: [{ label: "Start at", before: displayValue("entry", before.steps[0]?.id, before), after: displayValue("entry", after.steps[0]?.id, after) }] });
  if (before && before.steps.map((step) => step.id).join() !== after.steps.map((step) => step.id).join()) groups.push({ title: "Step order", fields: [{ label: "Listed order", before: before.steps.map((step) => step.title).join(" → ") || "No steps", after: after.steps.map((step) => step.title).join(" → ") || "No steps" }] });
  return groups;
}

export function WorkflowChangeReview({ before, after }: { before?: WorkflowDefinitionV1 | null; after: WorkflowDefinitionV1 }) {
  const changes = workflowReviewChanges(before, after);
  const authority = workflowAuthorityDiff(before ?? null, after);
  const authorityName = (value: string | null) => value ? names[value] ?? value : "role defaults";
  const removedGates = before?.steps.filter((step): step is Extract<WorkflowStep, { kind: "approval" }> => step.kind === "approval" && !after.steps.some((candidate) => candidate.kind === "approval" && candidate.gate === step.gate)) ?? [];
  return <div className="space-y-4 text-[var(--t-meta)]">
    <section aria-label="Authority review" className="space-y-2">
      <h3 className="font-medium">Authority and approvals</h3>
      <p className={authority.authorityExpanded ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}>{authority.authorityExpanded ? `Authority expands from ${authorityName(authority.before)} to ${authorityName(authority.after)}.` : `Highest explicit authority: ${authorityName(authority.after)}.`}</p>
      {authority.addedApprovalGates.length ? <p>Added approval roles: {authority.addedApprovalGates.map(readableName).join(", ")}.</p> : null}
      {removedGates.length ? <p className="text-[var(--warning)]">Removed approval roles: {[...new Set(removedGates.map((step) => readableName(step.gate)))].join(", ")}.</p> : null}
      {after.steps.some((step) => step.kind === "role-assign" && !step.mediatedAuthority) ? <p className="text-[var(--text-muted)]">Steps using role authority inherit the assigned role’s permissions.</p> : null}
    </section>
    {changes.length ? changes.map((group, index) => <section key={index} className="space-y-2">
      <h3 className="font-medium">{group.title}</h3>
      <dl className="space-y-3">{group.fields.map((field) => <div key={field.label}>
        <dt className="text-[var(--text-muted)]">{field.label}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words">{field.before !== undefined ? <><span className="text-[var(--text-muted)]">Current: {field.before}</span><br /><span>After: {field.after}</span></> : field.after}</dd>
      </div>)}</dl>
    </section>) : <p>No definition changes.</p>}
    <details className="text-[var(--text-muted)]">
      <summary className="cursor-pointer">Source</summary>
      {before ? <><p className="mt-3">Current definition</p><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[var(--t-meta)]">{JSON.stringify(before, null, 2)}</pre></> : null}
      <p className="mt-3">Definition after changes</p><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[var(--t-meta)]">{JSON.stringify(after, null, 2)}</pre>
    </details>
  </div>;
}
