import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canonicalWorkflowJson, workflowDefinitionHash } from "../../shared/workflow-schema.mjs";
import { assertPersistenceSafe } from "../../shared/persistence-redaction.mjs";
import { validateWorkflowDraftProposal, workflowDraftPath, WORKFLOW_DRAFT_MAX_BYTES } from "../../shared/workflow-draft-proposal.mjs";
import { createRouteConversationContext, publishConversationContext } from "./conversation-context";
import type { WorkflowDefinitionV1 } from "./workflow-schema";
import { readVaultFile, vaultPathExists } from "./vault";

export interface WorkflowAgentProposal {
  id: string;
  draftKey: string;
  definition: WorkflowDefinitionV1;
  summary: string;
  baseRevision: string;
}

export function parseWorkflowAgentProposal(raw: string, draftKey: string): WorkflowAgentProposal {
  if (new TextEncoder().encode(raw).byteLength > WORKFLOW_DRAFT_MAX_BYTES) throw new Error("Workflow proposal exceeds 512 KiB.");
  return validateWorkflowDraftProposal(JSON.parse(raw), draftKey) as WorkflowAgentProposal;
}

export async function workflowAgentDraftContext(input: { draftKey: string; currentDefinition: WorkflowDefinitionV1; selectedStepId?: string | null }, location: { pathname: string; search: string; hash?: string }) {
  workflowDraftPath(input.draftKey);
  const definition = JSON.parse(canonicalWorkflowJson(input.currentDefinition)) as WorkflowDefinitionV1;
  if (new TextEncoder().encode(JSON.stringify(definition)).byteLength > WORKFLOW_DRAFT_MAX_BYTES) throw new Error("Workflow draft exceeds 512 KiB.");
  assertPersistenceSafe(definition);
  const context = createRouteConversationContext(location);
  context.label = `${definition.name || "Untitled workflow"} · draft`;
  context.workflowDraft = {
    draftKey: input.draftKey,
    baseRevision: await workflowDefinitionHash(definition),
    definition,
    selectedStepId: input.selectedStepId ?? null,
    proposalTool: "propose_workflow_draft",
  };
  return context;
}

const acknowledgedKey = (draftKey: string) => `intelizen:workflow-proposal-reviewed:${draftKey}`;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useWorkflowAgentDraft(input: { draftKey: string; currentDefinition: WorkflowDefinitionV1; selectedStepId?: string | null }) {
  const { draftKey, currentDefinition, selectedStepId } = input;
  const canonical = useMemo(() => canonicalWorkflowJson(currentDefinition), [currentDefinition]);
  const [revision, setRevision] = useState({ canonical: "", value: "" });
  const draftRevision = revision.canonical === canonical ? revision.value : null;
  const [received, setReceived] = useState<WorkflowAgentProposal | null>(null);
  const proposal = received?.draftKey === draftKey ? received : null;
  const [error, setError] = useState<string | null>(null);
  const acknowledged = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    void workflowDefinitionHash(JSON.parse(canonical)).then((value) => { if (active) setRevision({ canonical, value }); }).catch((reason) => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, [canonical]);

  useEffect(() => {
    let active = true;
    let reading = false;
    setReceived(null);
    setError(null);
    const poll = async () => {
      if (reading) return;
      reading = true;
      try {
        const path = workflowDraftPath(draftKey);
        if (!await vaultPathExists(path, "vault")) return;
        const next = parseWorkflowAgentProposal(await readVaultFile(path, "vault"), draftKey);
        let reviewed = acknowledged.current.get(draftKey);
        try { reviewed ??= window.localStorage.getItem(acknowledgedKey(draftKey)) ?? undefined; } catch { /* retain in-memory review */ }
        if (active) { setReceived((current) => next.id === reviewed ? null : current?.id === next.id ? current : next); setError(null); }
      } catch (reason) {
        if (active) setError(message(reason));
      } finally { reading = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [draftKey]);

  const requestWithAgent = useCallback(async () => {
    try {
      const context = await workflowAgentDraftContext({ draftKey, currentDefinition, selectedStepId }, window.location);
      publishConversationContext(context);
      setError(null);
    } catch (reason) { setError(message(reason)); throw reason; }
  }, [draftKey, currentDefinition, selectedStepId]);

  const dismiss = useCallback((id?: string) => {
    const reviewed = id ?? proposal?.id;
    if (!reviewed) return;
    acknowledged.current.set(draftKey, reviewed);
    try { window.localStorage.setItem(acknowledgedKey(draftKey), reviewed); } catch { /* retain in-memory review */ }
    setReceived((current) => current?.id === reviewed ? null : current);
  }, [draftKey, proposal?.id]);

  return {
    proposal, draftRevision, requestWithAgent, dismiss, applied: dismiss,
    error: error ?? (proposal && draftRevision && proposal.baseRevision !== draftRevision ? "This proposal is based on an older draft. Review it against your current changes before requesting a fresh proposal." : null),
  };
}
