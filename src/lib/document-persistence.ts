import { createWorkspaceRecord, updateWorkspaceRecord } from "@/lib/data";
import {
  DOCUMENTS_DB_FIELDS,
  safeDocumentFolder,
  slugForDocumentTitle,
  upsertDocumentFrontmatterId,
} from "@/lib/documents";
import type {
  TaxonomyMetadata,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseRecord,
} from "@/lib/types";
import { removeVaultFile, writeVaultFile } from "@/lib/vault";

export interface PortableDocumentRowDraft {
  databaseId: string;
  fields: Record<string, WorkspaceDatabaseFieldValue>;
  body: string;
  taxonomy: TaxonomyMetadata;
}

export interface CreatePortableDocumentInput {
  databaseId: string;
  title: string;
  body: string;
  entity: string;
  author: string;
  docType?: string;
  folder?: string | null;
  fields?: Record<string, WorkspaceDatabaseFieldValue>;
  taxonomy?: TaxonomyMetadata;
  createRow?: (draft: PortableDocumentRowDraft) => Promise<WorkspaceDatabaseRecord>;
}

export interface PortableDocumentResult {
  record: WorkspaceDatabaseRecord;
  vaultPath: string | null;
  warning: string | null;
}

interface PortableDocumentDependencies {
  createRow: (draft: PortableDocumentRowDraft) => Promise<WorkspaceDatabaseRecord>;
  updateRow: (
    recordId: string,
    fields: Record<string, WorkspaceDatabaseFieldValue>,
    body: string,
  ) => Promise<WorkspaceDatabaseRecord>;
  writeFile: (path: string, body: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
  now: () => Date;
}

const defaultDependencies: PortableDocumentDependencies = {
  createRow: (draft) => createWorkspaceRecord({
    databaseId: draft.databaseId,
    fields: draft.fields,
    body: draft.body,
    taxonomy: draft.taxonomy,
  }),
  updateRow: (recordId, fields, body) => updateWorkspaceRecord(recordId, { fields, body }),
  writeFile: (path, body) => writeVaultFile(path, body),
  removeFile: (path) => removeVaultFile(path),
  now: () => new Date(),
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates the recoverable Supabase row first, then writes and links a portable
 * markdown file. A vault failure never erases the row or its markdown body.
 */
export async function createPortableDocument(
  input: CreatePortableDocumentInput,
  dependencyOverrides: Partial<PortableDocumentDependencies> = {},
): Promise<PortableDocumentResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const now = dependencies.now();
  const nowIso = now.toISOString();
  const folder = safeDocumentFolder(input.folder);
  const fields: Record<string, WorkspaceDatabaseFieldValue> = {
    ...(input.fields ?? {}),
    [DOCUMENTS_DB_FIELDS.title]: input.title.trim() || "Untitled document",
    [DOCUMENTS_DB_FIELDS.docType]: input.docType ?? "note",
    [DOCUMENTS_DB_FIELDS.entity]: input.entity,
    [DOCUMENTS_DB_FIELDS.author]: input.author,
    [DOCUMENTS_DB_FIELDS.vaultPath]: null,
    [DOCUMENTS_DB_FIELDS.folder]: folder,
    [DOCUMENTS_DB_FIELDS.createdAt]: nowIso,
    [DOCUMENTS_DB_FIELDS.updatedAt]: nowIso,
  };
  const taxonomy: TaxonomyMetadata = {
    entity: input.entity,
    area: "internal_ops",
    folder: "Documents",
    object_type: "document",
    routing_rule: "documents_database",
    ...(input.taxonomy ?? {}),
  };
  const draft = { databaseId: input.databaseId, fields, body: input.body, taxonomy };
  const created = await (input.createRow ?? dependencies.createRow)(draft);
  const portableBody = upsertDocumentFrontmatterId(input.body, created.id);

  let prepared: WorkspaceDatabaseRecord;
  try {
    prepared = await dependencies.updateRow(
      created.id,
      { ...created.fields, ...fields, [DOCUMENTS_DB_FIELDS.vaultPath]: null },
      portableBody,
    );
  } catch (error) {
    return {
      record: created,
      vaultPath: null,
      warning: `The document row was created, but its portable metadata could not be saved: ${errorMessage(error)}`,
    };
  }

  const vaultPath = `${folder}/${slugForDocumentTitle(input.title)}-${now.getTime()}.md`;
  let fileWritten = false;
  try {
    await dependencies.writeFile(vaultPath, portableBody);
    fileWritten = true;
    const linked = await dependencies.updateRow(
      created.id,
      { ...prepared.fields, [DOCUMENTS_DB_FIELDS.vaultPath]: vaultPath },
      portableBody,
    );
    return { record: linked, vaultPath, warning: null };
  } catch (error) {
    let cleanupWarning = "";
    if (fileWritten) {
      try {
        await dependencies.removeFile(vaultPath);
      } catch (cleanupError) {
        cleanupWarning = ` The unlinked file could not be removed from ${vaultPath}: ${errorMessage(cleanupError)}`;
      }
    }
    return {
      record: prepared,
      vaultPath: null,
      warning: `The document row and markdown body were saved, but the vault file was not linked: ${errorMessage(error)}${cleanupWarning}`,
    };
  }
}
