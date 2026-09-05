export const WORKFLOW_DRAFT_DIRECTORY: string;
export const WORKFLOW_DRAFT_MAX_BYTES: number;
export interface WorkflowDraftProposalFile {
  id: string;
  draftKey: string;
  baseRevision: string;
  summary: string;
  definition: unknown;
}
export function workflowDraftPath(key: string): string;
export function validateWorkflowDraftProposal(value: unknown, expectedKey?: string): WorkflowDraftProposalFile;
