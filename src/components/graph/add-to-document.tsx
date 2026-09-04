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
import { writeVaultBinaryFile, writeVaultFile } from "@/lib/vault";
import {
  buildGraphDocumentBody,
  buildGraphDocumentSection,
  buildGraphSnapshotImageBlock,
  decodePngDataUrl,
  graphIdFor,
  graphSnapshotPaths,
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

async function appendDocumentSection(recordId: string, section: string) {
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
  capturePng,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  projectId: number | null;
  mode: GraphExportMode;
  capturePng: () => Promise<string | null>;
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
    () => (docs.data?.records ?? []).filter((record) => {
      const path = documentFieldString(model(record), DOCUMENTS_DB_FIELDS.vaultPath).trim();
      return !record.taxonomy?.is_template && !isAbsoluteDocumentPath(path);
    }).map(model),
    [docs.data?.records],
  );

  useEffect(() => {
    if (open && !recordId && records[0]) setRecordId(records[0].id);
  }, [open, recordId, records]);

  const add = useMutation({
    mutationFn: async () => {
      const spec = { id: graphIdFor(projectId), mode };
      const capture = await capturePng();
      if (!capture) throw new Error("The graph image could not be captured.");
      const bytes = decodePngDataUrl(capture);
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
        const documentPath = result.vaultPath ?? "documents/document.md";
        const paths = graphSnapshotPaths(documentPath, spec);
        await writeVaultBinaryFile(paths.vaultPath, bytes);
        const updated = await appendDocumentSection(result.record.id, buildGraphSnapshotImageBlock(paths.markdownPath));
        await syncPortableBody(updated);
        return { recordId: updated.id, warning: result.warning };
      }

      if (!recordId) throw new Error("Choose a document.");
      const current = (await getDocumentsWorkspaceBundle()).records.find((record) => record.id === recordId);
      if (!current) throw new Error("That document no longer exists.");
      const documentPath = documentFieldString(model(current), DOCUMENTS_DB_FIELDS.vaultPath).trim() || "documents/document.md";
      if (isAbsoluteDocumentPath(documentPath)) throw new Error("Choose a portable workspace document for a graph snapshot.");
      const paths = graphSnapshotPaths(documentPath, spec);
      await writeVaultBinaryFile(paths.vaultPath, bytes);
      const section = buildGraphDocumentSection(current.body, spec, paths.markdownPath);
      const updated = await appendDocumentSection(recordId, section);
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
      description="Save a PNG snapshot, insert the live linked graph, then open the document."
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
          <Button variant="secondary" className={choice === "existing" ? "border-transparent bg-[var(--selected)] hover:bg-[var(--selected-hover)]" : undefined} onClick={() => setChoice("existing")}>Existing document</Button>
          <Button variant="secondary" className={choice === "new" ? "border-transparent bg-[var(--selected)] hover:bg-[var(--selected-hover)]" : undefined} onClick={() => setChoice("new")}>New document</Button>
        </div>
        {choice === "existing" ? (
          docs.isPending ? (
            <p className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">Loading documents…</p>
          ) : docs.error ? (
            <p className="font-ui text-[var(--t-meta)] text-[var(--bad)]">Documents could not be loaded.</p>
          ) : records.length ? (
            <Select value={recordId} onChange={(event) => setRecordId(event.target.value)} aria-label="Document">
              {records.map((record) => <option key={record.id} value={record.id}>{documentDisplayTitle(record)}</option>)}
            </Select>
          ) : (
            <p className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">No documents yet. Choose New document.</p>
          )
        ) : (
          <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Document title" autoFocus />
        )}
        {add.error ? <p role="alert" className="font-ui text-[var(--t-meta)] text-[var(--bad)]">{add.error instanceof Error ? add.error.message : "The graph could not be added."}</p> : null}
      </div>
    </AppDialog>
  );
}
