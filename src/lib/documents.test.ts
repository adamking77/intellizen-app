import { describe, expect, it } from "vitest";

import {
  DOCUMENTS_DB_FIELDS,
  documentAttachmentLabel,
  documentBodyPreview,
  documentDisplayTitle,
  documentFreshness,
  documentMatchesSearch,
  documentSourceLabel,
  quickNoteTitle,
  safeDocumentFolder,
  todaysDailyBriefs,
  upsertDocumentFrontmatterId,
} from "@/lib/documents";
import type { WorkspaceDatabaseRecordModel } from "@/lib/types";

function record(fields: Partial<WorkspaceDatabaseRecordModel> = {}): WorkspaceDatabaseRecordModel {
  return { id: "doc-1", ...fields };
}

describe("document model", () => {
  it("uses the record title before the filename fallback", () => {
    expect(documentDisplayTitle(record({
      [DOCUMENTS_DB_FIELDS.title]: "PDA: What Works",
      [DOCUMENTS_DB_FIELDS.vaultPath]: "documents/pda-what-works_v2.md",
    }))).toBe("PDA: What Works");
    expect(documentDisplayTitle(record({
      [DOCUMENTS_DB_FIELDS.vaultPath]: "documents/pda-what-works_v2.md",
    }))).toBe("Pda what works v2");
  });

  it("searches title, provenance, attachment, and path fields", () => {
    const candidate = record({
      [DOCUMENTS_DB_FIELDS.title]: "Discovery brief",
      [DOCUMENTS_DB_FIELDS.author]: "Fiona",
      [DOCUMENTS_DB_FIELDS.entity]: "genzen_solutions",
      [DOCUMENTS_DB_FIELDS.linkedCase]: "case-2026-009",
      [DOCUMENTS_DB_FIELDS.vaultPath]: "cases/009/discovery.md",
    });
    expect(documentMatchesSearch(candidate, "fiona")).toBe(true);
    expect(documentMatchesSearch(candidate, "2026-009")).toBe(true);
    expect(documentMatchesSearch(candidate, "invoice")).toBe(false);
  });

  it("marks recently created and materially updated documents", () => {
    const now = Date.parse("2026-07-15T12:00:00Z");
    expect(documentFreshness(record({
      [DOCUMENTS_DB_FIELDS.createdAt]: "2026-07-15T08:00:00Z",
      [DOCUMENTS_DB_FIELDS.updatedAt]: "2026-07-15T08:00:00Z",
    }), now)).toBe("new");
    expect(documentFreshness(record({
      [DOCUMENTS_DB_FIELDS.createdAt]: "2026-07-10T08:00:00Z",
      [DOCUMENTS_DB_FIELDS.updatedAt]: "2026-07-15T08:00:00Z",
    }), now)).toBe("changed");
  });

  it("describes attached records and file provenance", () => {
    expect(documentAttachmentLabel(record({
      [DOCUMENTS_DB_FIELDS.linkedClient]: "client-42",
    }))).toBe("Client client-42");
    expect(documentSourceLabel(record({
      [DOCUMENTS_DB_FIELDS.vaultPath]: "documents/brief.md",
    }))).toContain("GenZen OS vault");
    expect(documentSourceLabel(record({
      [DOCUMENTS_DB_FIELDS.vaultPath]: "/Users/adam/Desktop/brief.md",
    }))).toBe("File outside the GenZen OS vault");
  });

  it("adds or replaces a stable frontmatter id without touching markdown", () => {
    expect(upsertDocumentFrontmatterId("# Note\n", "doc-1")).toBe(
      "---\nintellizen_id: doc-1\n---\n\n# Note\n",
    );
    expect(upsertDocumentFrontmatterId(
      "---\ntitle: Note\nintellizen_id: old\n---\n\nBody\n",
      "doc-2",
    )).toBe("---\ntitle: Note\nintellizen_id: doc-2\n---\n\nBody\n");
  });

  it("creates a useful zero-friction quick-note title", () => {
    expect(quickNoteTitle(new Date("2026-07-15T09:07:00Z"))).toMatch(/^Quick note — Jul 15, 2026, \d{2}:\d{2}$/);
  });

  it("keeps generated files inside a safe vault folder", () => {
    expect(safeDocumentFolder("documents/agent-replies/")).toBe("documents/agent-replies");
    expect(safeDocumentFolder("../../Desktop")).toBe("documents");
    expect(safeDocumentFolder("/Users/adam/Desktop")).toBe("documents");
  });

  it("finds today's daily briefs within the active venture", () => {
    const briefs = todaysDailyBriefs([
      record({
        id: "today-gzs",
        [DOCUMENTS_DB_FIELDS.docType]: "daily-brief",
        [DOCUMENTS_DB_FIELDS.entity]: "genzen_solutions",
        [DOCUMENTS_DB_FIELDS.createdAt]: "2026-07-15T08:00:00+04:00",
        [DOCUMENTS_DB_FIELDS.updatedAt]: "2026-07-15T09:00:00+04:00",
      }),
      record({
        id: "yesterday",
        [DOCUMENTS_DB_FIELDS.docType]: "daily-brief",
        [DOCUMENTS_DB_FIELDS.entity]: "genzen_solutions",
        [DOCUMENTS_DB_FIELDS.createdAt]: "2026-07-14T08:00:00+04:00",
      }),
      record({
        id: "today-gokart",
        [DOCUMENTS_DB_FIELDS.docType]: "daily-brief",
        [DOCUMENTS_DB_FIELDS.entity]: "gokart_studio",
        [DOCUMENTS_DB_FIELDS.createdAt]: "2026-07-15T08:00:00+04:00",
      }),
    ], {
      now: new Date("2026-07-15T12:00:00+04:00"),
      entity: "genzen_solutions",
    });
    expect(briefs.map((brief) => brief.id)).toEqual(["today-gzs"]);
  });

  it("turns portable markdown into a concise widget preview", () => {
    expect(documentBodyPreview(
      "---\nintellizen_id: brief-1\n---\n\n# Daily brief\n\n**Needs you:** Review [proposal](https://example.com).",
    )).toBe("Daily brief Needs you: Review proposal.");
  });
});
