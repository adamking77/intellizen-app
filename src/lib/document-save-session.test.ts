import { describe, expect, it, vi } from "vitest";
import { DocumentSaveSession } from "./document-save-session";
import { composeDocument, documentPage, splitDocumentEmbeds } from "./document-editing";

describe("document edits survive navigation and in-flight writes", () => {
  it("flushes on departure and orders a later edit after the pending write", async () => {
    let release!: () => void;
    const saved: string[] = [];
    const save = vi.fn(async (text: string) => { saved.push(text); if (saved.length === 1) await new Promise<void>((done) => { release = done; }); });
    const session = new DocumentSaveSession({ initial: "original", save, storeDraft: vi.fn() });
    session.edit("first");
    const departing = session.flush();
    session.edit("second");
    release();
    await departing;
    expect(saved).toEqual(["first", "second"]);
    expect(session.getSnapshot()).toMatchObject({ text: "second", status: "saved" });
  });
  it("retains a failed draft and retries without touching another document", async () => {
    const storeDraft = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const a = new DocumentSaveSession({ initial: "a", save, storeDraft });
    const b = new DocumentSaveSession({ initial: "b", save: vi.fn(), storeDraft: vi.fn() });
    a.edit("changed a"); await a.flush();
    expect(a.getSnapshot().status).toBe("error");
    expect(storeDraft).not.toHaveBeenCalledWith(null);
    expect(b.getSnapshot().text).toBe("b");
    await a.flush();
    expect(storeDraft).toHaveBeenLastCalledWith(null);
  });
  it("adopts a fresh revisit only when clean and preserves unsaved work", async () => {
    const session = new DocumentSaveSession({ initial: "old cache", save: vi.fn(), storeDraft: vi.fn() });
    session.adopt("fresh server");
    expect(session.getSnapshot().text).toBe("fresh server");
    session.edit("local edit");
    session.adopt("refetch");
    expect(session.getSnapshot().text).toBe("local edit");
    await session.flush();
    session.adopt("later server edit");
    expect(session.getSnapshot().text).toBe("later server edit");
  });
  it("clears dirty state after undoing back to the saved text", async () => {
    const save = vi.fn();
    const session = new DocumentSaveSession({ initial: "original", save, storeDraft: vi.fn() });
    session.edit("changed"); session.edit("original"); await session.flush();
    expect(save).not.toHaveBeenCalled();
    expect(session.getSnapshot().status).toBe("saved");
  });
  it("keeps frontmatter, graph blocks, and non-title headings", () => {
    const raw = '---\nowner: Fiona\n---\n\n# Title\n\nA [link](https://example.com).\n\n```graph {"id":"2","mode":"insight"}\n```\n\n## Evidence\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    const page = documentPage(raw, "Fallback");
    const segments = splitDocumentEmbeds(page.body);
    expect(segments.map((segment) => segment.text).join("")).toBe(page.body);
    expect(segments.filter((segment) => segment.graph)).toHaveLength(1);
    const result = composeDocument(raw, "Renamed", page.body, "record-a");
    expect(result).toContain("owner: Fiona");
    expect(result).toContain("intellizen_id: record-a");
    expect(documentPage(result, "Fallback")).toEqual({ title: "Renamed", body: page.body });
  });
});
