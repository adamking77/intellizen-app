import { validateWorkflowDefinition } from "./workflow-schema.mjs";
import { assertPersistenceSafe } from "./persistence-redaction.mjs";

export const WORKFLOW_DRAFT_DIRECTORY = "session/intellizen-workflow-drafts";
export const WORKFLOW_DRAFT_MAX_BYTES = 512 * 1024;
export function workflowDraftPath(key) {
  if (typeof key !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(key)) throw new Error("Invalid workflow draft key.");
  return `${WORKFLOW_DRAFT_DIRECTORY}/${key}.json`;
}
export function validateWorkflowDraftProposal(value, expectedKey) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed workflow proposal.");
  workflowDraftPath(value.draftKey);
  if (expectedKey !== undefined && value.draftKey !== expectedKey) throw new Error("This proposal belongs to another workflow draft.");
  if (typeof value.id !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(value.id)) throw new Error("Invalid proposal identity.");
  if (typeof value.baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.baseRevision)) throw new Error("Invalid proposal base revision.");
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 2000) throw new Error("Proposal summary must contain 1–2000 characters.");
  const validation = validateWorkflowDefinition(value.definition);
  if (!validation.valid) throw new Error(`Invalid workflow proposal: ${validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > WORKFLOW_DRAFT_MAX_BYTES) throw new Error("Workflow proposal exceeds 512 KiB.");
  assertPersistenceSafe(value);
  return value;
}
