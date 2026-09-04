// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Investigation, WorkspaceDatabaseRecord } from "@/lib/types";
import { ProjectBrief, ProjectEvidenceTable } from "./project-views";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => document.body.replaceChildren());

const file: WorkspaceDatabaseRecord = {
  id: "doc-1", database_id: "docs", body: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-03T00:00:00Z",
  fields: { doc_title: "Case brief", doc_author: "Adam", doc_stage: "Draft" },
};

const investigation = { id: 7, current_phase: 3, created_at: "2026-09-01T00:00:00Z" } as Investigation;

describe("project room views", () => {
  it("renders the client brief stage and real evidence counts", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    await act(async () => root.render(<ProjectBrief clientCase files={[file]} linkedRecords={[]} graphCount={4} investigation={investigation} />));
    expect(host.querySelector('[aria-label="Case stage"]')?.textContent).toContain("3Analysenow");
    expect(host.textContent).toContain("0 records · 1 documents · 4 entities");
    expect(host.textContent).toContain("you");
    await act(async () => root.unmount());
  });

  it("uses 32px table lines and opens evidence through one callback", async () => {
    const open = vi.fn();
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    await act(async () => root.render(<ProjectEvidenceTable files={[file]} linkedRecords={[]} onOpenDocument={open} onOpenRecord={vi.fn()} />));
    const row = host.querySelector<HTMLButtonElement>('button[role="row"]')!;
    expect(row.className).toContain("h-[var(--h-line)]");
    await act(async () => row.click());
    expect(open).toHaveBeenCalledWith(file);
    await act(async () => root.unmount());
  });

  it("lists a project folder file beside workspace documents", async () => {
    const openFile = vi.fn();
    const folderFile = { id: "/work/main.ts", title: "main.ts", path: "/work/main.ts", folder: "/work", updatedAt: 1_788_000_000_000 };
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    await act(async () => root.render(<ProjectEvidenceTable files={[file]} folderFiles={[folderFile]} linkedRecords={[]} onOpenDocument={vi.fn()} onOpenFile={openFile} onOpenRecord={vi.fn()} />));
    const row = [...host.querySelectorAll<HTMLButtonElement>('button[role="row"]')].find((candidate) => candidate.textContent?.includes("main.ts"))!;
    expect(row.textContent).toContain("workfile");
    await act(async () => row.click());
    expect(openFile).toHaveBeenCalledWith(folderFile);
    await act(async () => root.unmount());
  });
});
