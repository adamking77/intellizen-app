import { getWorkspaceRecord, GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { WorkflowTemplateItem } from "@/lib/types";
import { readVaultFile } from "@/lib/vault";

export async function getWorkflowSource(workflow: WorkflowTemplateItem) {
  const record = await getWorkspaceRecord(workflow.id);
  const registryBody = record.body ?? "";
  const reference = Array.isArray(workflow.source_document_id) ? workflow.source_document_id[0] : workflow.source_document_id;
  const sourceDocumentId = reference == null ? null : String(reference);
  const sourcePath = workflow.source_path;
  const result = { content: registryBody, registryBody, sourcePath, sourceDocumentId, warning: null as string | null,
    recordHref: `/databases/${GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry}?record=${encodeURIComponent(record.id)}` };
  if (sourcePath) {
    const relative = sourcePath.replace(/^.*\/vault\//, "").replace(/^~\/vault\//, "");
    if (!relative.startsWith("/")) {
      try { return { ...result, content: await readVaultFile(relative, "vault") }; }
      catch { /* The indexed canonical document remains a readable fallback. */ }
    }
  }
  if (sourceDocumentId || sourcePath) {
    let query = supabase.schema("knowledge").from("documents").select("content, source_path");
    query = sourceDocumentId ? query.eq("id", sourceDocumentId) : query.eq("source_path", sourcePath!);
    const { data, error } = await query.limit(1).maybeSingle();
    if (!error && data?.content) return { ...result, content: String(data.content), sourcePath: data.source_path ?? sourcePath };
    result.warning = "The linked source could not be opened. Showing the full Registry text.";
  }
  return result;
}
