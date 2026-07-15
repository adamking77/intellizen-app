import { describe, expect, it, vi } from "vitest";

import { createPortableDocument } from "@/lib/document-persistence";
import { DOCUMENTS_DB_FIELDS } from "@/lib/documents";
import type { WorkspaceDatabaseFieldValue, WorkspaceDatabaseRecord } from "@/lib/types";

function makeRecord(fields: Record<string, WorkspaceDatabaseFieldValue>, body: string): WorkspaceDatabaseRecord {
  return {
    id: "doc-123",
    database_id: "documents-db",
    entity: "genzen_solutions",
    fields,
    body,
    taxonomy: { entity: "genzen_solutions" },
    created_at: "2026-07-15T08:00:00.000Z",
    updated_at: "2026-07-15T08:00:00.000Z",
  };
}

describe("portable document persistence", () => {
  it("creates the row first, writes stable frontmatter, then links the file", async () => {
    const sequence: string[] = [];
    let current = makeRecord({}, "");
    const result = await createPortableDocument({
      databaseId: "documents-db",
      title: "Fiona — Review the proposal",
      body: "# Fiona response\n\nLooks good.",
      entity: "genzen_solutions",
      author: "Fiona",
      folder: "documents/agent-replies",
    }, {
      now: () => new Date("2026-07-15T09:30:00.000Z"),
      createRow: async (draft) => {
        sequence.push("create-row");
        current = makeRecord(draft.fields, draft.body);
        return current;
      },
      updateRow: async (_id, fields, body) => {
        sequence.push(fields[DOCUMENTS_DB_FIELDS.vaultPath] ? "link-row" : "prepare-row");
        current = { ...current, fields, body };
        return current;
      },
      writeFile: async (_path, body) => {
        sequence.push("write-file");
        expect(body).toContain("intellizen_id: doc-123");
      },
    });

    expect(sequence).toEqual(["create-row", "prepare-row", "write-file", "link-row"]);
    expect(result.warning).toBeNull();
    expect(result.vaultPath).toBe("documents/agent-replies/fiona-review-the-proposal-1784107800000.md");
    expect(result.record.body).toContain("intellizen_id: doc-123");
  });

  it("preserves the Supabase row and body when the vault write fails", async () => {
    let current = makeRecord({}, "");
    const removeFile = vi.fn(async () => undefined);
    const result = await createPortableDocument({
      databaseId: "documents-db",
      title: "Fiona response",
      body: "Useful answer",
      entity: "gokart_studio",
      author: "Fiona",
    }, {
      now: () => new Date("2026-07-15T09:30:00.000Z"),
      createRow: async (draft) => {
        current = makeRecord(draft.fields, draft.body);
        return current;
      },
      updateRow: async (_id, fields, body) => {
        current = { ...current, fields, body };
        return current;
      },
      writeFile: async () => { throw new Error("Vault unavailable"); },
      removeFile,
    });

    expect(result.record.body).toContain("intellizen_id: doc-123");
    expect(result.record.fields[DOCUMENTS_DB_FIELDS.entity]).toBe("gokart_studio");
    expect(result.record.fields[DOCUMENTS_DB_FIELDS.vaultPath]).toBeNull();
    expect(result.warning).toContain("Vault unavailable");
    expect(removeFile).not.toHaveBeenCalled();
  });
});
