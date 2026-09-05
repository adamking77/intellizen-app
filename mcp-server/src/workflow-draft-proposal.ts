import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { validateWorkflowDraftProposal, workflowDraftPath } from "../../shared/workflow-draft-proposal.mjs";
import { dryRunPreview } from "./write-contract.js";

export function proposeWorkflowDraft(input: { draft_key: string; base_revision: string; definition: unknown; summary: string; confirm_write?: boolean }, vaultRoot = join(homedir(), "vault")) {
  const proposal = validateWorkflowDraftProposal({ id: randomUUID(), draftKey: input.draft_key, baseRevision: input.base_revision, definition: input.definition, summary: input.summary });
  const path = join(vaultRoot, workflowDraftPath(proposal.draftKey));
  const preview = { draft_key: proposal.draftKey, base_revision: proposal.baseRevision, summary: proposal.summary, definition: proposal.definition, lands_as: "A workflow draft proposal for review. Registry, saved versions, activation and execution are unchanged." };
  if (input.confirm_write !== true) return dryRunPreview("propose_workflow_draft", "stage this workflow draft proposal", preview);
  // Reject symlinked folders/targets instead of letting a draft key write
  // through the vault boundary. The temporary file is exclusive and local.
  for (const candidate of [vaultRoot, join(vaultRoot, "session"), dirname(path), path]) {
    if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) throw new Error("Workflow draft proposal path cannot contain symlinks.");
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${proposal.id}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(proposal), { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { dry_run: false, write_performed: true, proposal_id: proposal.id, proposal_file: path, ...preview };
}

export const proposeWorkflowDraftTool = {
  name: "propose_workflow_draft",
  description: "Preview or stage a complete workflow definition for review in the open workflow designer. Copy draft_key and base_revision from the explicitly shared workflowDraft context. Adam reviews the proposal before applying it; this tool never saves the Registry, activates or runs a workflow.",
  inputSchema: {
    type: "object",
    properties: {
      draft_key: { type: "string" }, base_revision: { type: "string" },
      definition: { type: "object", description: "Complete valid intellizen.workflow/1 definition." },
      summary: { type: "string", description: "Brief explanation of the proposed changes." },
      confirm_write: { type: "boolean", description: "Omit for dry-run preview; true stages the proposal for review." },
    },
    required: ["draft_key", "base_revision", "definition", "summary"],
    additionalProperties: false,
  },
};
export function proposeWorkflowDraftCall(args: unknown) {
  const result = proposeWorkflowDraft(args as Parameters<typeof proposeWorkflowDraft>[0]);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
