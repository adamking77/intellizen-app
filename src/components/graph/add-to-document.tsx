import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  getDocumentsWorkspaceBundle,
  listAllVaultFiles,
  updateVaultFileContent,
} from "@/lib/data";
import { createPortableDocument } from "@/lib/document-persistence";
import {
  DOCUMENTS_DB_FIELDS,
  documentDisplayTitle,
  documentFieldString,
  isAbsoluteDocumentPath,
} from "@/lib/documents";
import type { WorkspaceDatabaseRecord, WorkspaceDatabaseRecordModel } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { writeVaultFile } from "@/lib/vault";
import {
  buildGraphDocumentBody,
  buildGraphEmbedBlock,
  documentHasGraphEmbed,
  graphIdFor,
  type GraphExportMode,
} from "./export";

function model(record: WorkspaceDatabaseRecord): WorkspaceDatabaseRecordModel {
  return {
    id: record.id,
    _body: record.body ?? undefined,
    _createdAt: record.created_at,
    _updatedAt: record.updated_at,
    _isTemplate: record.taxonomy?.is_template === true || undefined,
    ...record.fields,
  };
}

async function syncPortableBody(record: WorkspaceDatabaseRecord) {
  const path = documentFieldString(model(record), DOCUMENTS_DB_FIELDS.vaultPath).trim();
  if (!path || isAbsoluteDocumentPath(path) || !record.body) return;
  const mirror = (await listAllVaultFiles()).find((file) => file.file_path === path);
  if (mirror) await updateVaultFileContent(mirror.id, record.body);
  await writeVaultFile(path, record.body);
}

async function appendGraphEmbed(recordId: string, section: string) {
  const { data, error } = await supabase.schema("workspace").rpc("append_record_section", {
    p_record_id: recordId,
    p_section: section,
    p_fields_patch: { [DOCUMENTS_DB_FIELDS.updatedAt]: new Date().toISOString() },
  });
  if (error) throw error;
  return data as WorkspaceDatabaseRecord;
}

export function AddGraphToDocument({
  open,
  projectId,
  mode,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  projectId: number | null;
  mode: GraphExportMode;
  onOpenChange: (open: boolean) => void;
  onAdded: (recordId: string, warning: string | null) => void;
}) {
  const [choice, setChoice] = useState<"existing" | "new">("existing");
  const [recordId, setRecordId] = useState("");
  const [title, setTitle] = useState("Graph snapshot");
  const docs = useQuery({
    queryKey: ["docs-workspace-bundle", "graph-picker"],
    queryFn: () => getDocumentsWorkspaceBundle(),
    enabled: open,
  });
  const records = useMemo(
    () => (docs.data?.records ?? []).filter((record) => !record.taxonomy?.is_template).map(model),
    [docs.data?.records],
  );

  useEffect(() => {
    if (open && !recordId && records[0]) setRecordId(records[0].id);
  }, [open, recordId, records]);

  const add = useMutation({
    mutationFn: async () => {
      const spec = { id: graphIdFor(projectId), mode };
      if (choice === "new") {
        if (!docs.data?.database.id) throw new Error("The Documents database is not ready.");
        const name = title.trim() || "Graph snapshot";
        const result = await createPortableDocument({
          databaseId: docs.data.database.id,
          title: name,
          body: buildGraphDocumentBody(name, spec),
          entity: "genzen",
          author: "Adam",
          docType: "note",
          fields: projectId === null ? undefined : { [DOCUMENTS_DB_FIELDS.project]: String(projectId) },
        });
        return { recordId: result.record.id, warning: result.warning };
      }

      if (!recordId) throw new Error("Choose a document.");
      const current = (await getDocumentsWorkspaceBundle()).records.find((record) => record.id === recordId);
      if (!current) throw new Error("That document no longer exists.");
      const updated = documentHasGraphEmbed(current.body, spec)
        ? current
        : await appendGraphEmbed(recordId, buildGraphEmbedBlock(spec));
      await syncPortableBody(updated);
      return { recordId: updated.id, warning: null };
    },
    onSuccess: ({ recordId: addedId, warning }) => {
      if (warning) toast.info("Document created in Supabase only", { description: warning });
      onAdded(addedId, warning);
    },
  });

  return (
    <AppDialog
      open={open}
      title="Add graph to document"
      description="Insert a linked snapshot, then open the document."
      onOpenChange={onOpenChange}
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || docs.isPending || (choice === "existing" ? !recordId : !title.trim())}
          >
            {add.isPending ? "Adding…" : "Add and open"}
          </Button>
        </>
      )}
    >
      <div className="grid gap-4">
        <div className="flex gap-2" role="radiogroup" aria-label="Document destination">
          <Button variant={choice === "existing" ? "accent-soft" : "secondary"} onClick={() => setChoice("existing")}>Existing document</Button>
          <Button variant={choice === "new" ? "accent-soft" : "secondary"} onClick={() => setChoice("new")}>New document</Button>
        </div>
        {choice === "existing" ? (
          docs.isPending ? (
            <p className="font-ui text-[12px] text-[var(--text-muted)]">Loading documents…</p>
          ) : docs.error ? (
            <p className="font-ui text-[12px] text-[var(--bad)]">Documents could not be loaded.</p>
          ) : records.length ? (
            <Select value={recordId} onChange={(event) => setRecordId(event.target.value)} aria-label="Document">
              {records.map((record) => <option key={record.id} value={record.id}>{documentDisplayTitle(record)}</option>)}
            </Select>
          ) : (
            <p className="font-ui text-[12px] text-[var(--text-muted)]">No documents yet. Choose New document.</p>
          )
        ) : (
          <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Document title" autoFocus />
        )}
        {add.error ? <p role="alert" className="font-ui text-[12px] text-[var(--bad)]">{add.error instanceof Error ? add.error.message : "The graph could not be added."}</p> : null}
      </div>
    </AppDialog>
  );
}
