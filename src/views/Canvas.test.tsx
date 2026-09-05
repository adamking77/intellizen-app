// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasDocument, CanvasDocumentData } from "@/lib/types";

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), save: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn() }));
vi.mock("@/lib/data", () => ({ listCanvasDocuments: api.list, getCanvasDocument: api.get, updateCanvasDocumentContent: api.save, createCanvasDocument: api.create, deleteCanvasDocument: api.remove, updateCanvasDocument: api.rename }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn() }, toastError: vi.fn() }));
vi.mock("@/components/canvas/CanvasEditor", () => ({ CanvasEditor: ({ initialDocument, onChange }: { initialDocument: CanvasDocumentData; onChange: (document: CanvasDocumentData) => void }) => <div data-editor>{initialDocument.nodes[0]?.text}<button onClick={() => onChange({ ...initialDocument, nodes: [{ ...initialDocument.nodes[0], text: `${initialDocument.nodes[0]?.text} edited` }] })}>Edit canvas fixture</button></div> }));

import { CanvasView } from "./Canvas";
import { CANVAS_DRAFT_PREFIX, canvasSaveSessions } from "@/lib/canvas-save-session";

function document(id: number): CanvasDocument {
  return { id, name: `Canvas ${id}`, project_id: null, case_id: null, created_at: "2026-09-05", updated_at: "2026-09-05", content_json: { nodes: [{ id: "n", type: "text", x: 0, y: 0, width: 200, height: 100, text: `Body ${id}` }], edges: [] } };
}
const cleanups: (() => Promise<void>)[] = [];
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
async function mount(route = "/canvas?canvas=1") {
  const element = window.document.createElement("div");
  window.document.body.append(element);
  const root = createRoot(element);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let navigate!: NavigateFunction;
  function Location() { navigate = useNavigate(); return <output>{useLocation().search}</output>; }
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><Location /><CanvasView /></MemoryRouter></QueryClientProvider>));
  await settle(); await settle();
  let closed = false;
  const close = async () => { if (closed) return; closed = true; await act(async () => root.unmount()); element.remove(); client.clear(); };
  cleanups.push(close);
  return { element, client, close, navigate: async (url: string) => { await act(async () => navigate(url)); await settle(); }, click: async (text: string) => { const button = Array.from(element.querySelectorAll("button")).find((node) => node.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); await settle(); } };
}

beforeEach(() => {
  window.localStorage.clear();
  api.list.mockReset().mockResolvedValue([document(1), document(2)]);
  api.get.mockReset().mockImplementation(async (id: number) => document(id));
  api.save.mockReset().mockImplementation(async (id: number, content: CanvasDocumentData) => ({ ...document(id), content_json: content }));
});
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
  for (const session of canvasSaveSessions.values()) await session.flush();
  canvasSaveSessions.clear();
});

describe("Canvas route continuity and recovery", () => {
  it("writes the chosen exact identity to the route and preserves other scope", async () => {
    const app = await mount("/canvas?canvas=1&project=scope");
    await app.click("Canvas 2");
    expect(app.element.querySelector("output")?.textContent).toBe("?canvas=2&project=scope");
    expect(app.element.querySelector("[data-editor]")?.textContent).toContain("Body 2");
    await app.client.invalidateQueries({ queryKey: ["canvas-documents"] });
    await settle();
    expect(app.element.querySelector('[aria-current="page"]')?.textContent).toContain("Canvas 2");
    await app.navigate("/canvas?canvas=bad");
    expect(app.element.textContent).toContain("Canvas unavailable");
    expect(app.element.querySelector("[data-editor]")).toBeNull();
  });

  it("fetches an explicit canvas outside the list instead of substituting its first entry", async () => {
    const app = await mount("/canvas?canvas=99");
    expect(api.get).toHaveBeenCalledWith(99);
    expect(app.element.querySelector("[data-editor]")?.textContent).toContain("Body 99");
  });

  it("distinguishes list and document failures from empty content and retries", async () => {
    api.list.mockRejectedValue(new Error("List offline"));
    const app = await mount("/canvas");
    expect(app.element.textContent).toContain("Canvas list unavailable");
    expect(app.element.textContent).not.toContain("No canvases yet");
    api.list.mockResolvedValue([document(1)]);
    await app.click("Retry");
    await settle();
    expect(app.element.querySelector("[data-editor]")?.textContent).toContain("Body 1");
    api.get.mockRejectedValue(new Error("Exact canvas missing"));
    await app.navigate("/canvas?canvas=999");
    expect(app.element.textContent).toContain("Canvas unavailable");
    expect(app.element.textContent).toContain("Exact canvas missing");
    expect(app.element.querySelector("[data-editor]")).toBeNull();
  });

  it("shows pending canvas loading separately from a confirmed empty list", async () => {
    api.get.mockReturnValue(new Promise(() => undefined));
    const pending = await mount();
    expect(pending.element.textContent).toContain("Loading canvas");
    expect(pending.element.textContent).not.toContain("Canvas unavailable");
    expect(pending.element.querySelector("[data-editor]")).toBeNull();
    await pending.close();
    api.list.mockResolvedValue([]);
    const empty = await mount("/canvas");
    expect(empty.element.textContent).toContain("No canvases yet");
    expect(empty.element.textContent).toContain("Select a canvas");
    expect(empty.element.textContent).not.toContain("Canvas unavailable");
  });

  it("keeps a loaded editor usable when its background refresh fails", async () => {
    const app = await mount();
    api.get.mockRejectedValue(new Error("Refresh offline"));
    await act(async () => { await app.client.invalidateQueries({ queryKey: ["canvas-document", 1] }); });
    await settle();
    expect(app.element.textContent).toContain("Canvas refresh failed");
    expect(app.element.querySelector("[data-editor]")?.textContent).toContain("Body 1");
  });

  it("flushes edits when switching before the debounce and on unmount", async () => {
    const app = await mount();
    await app.click("Edit canvas fixture");
    expect(api.save).not.toHaveBeenCalled();
    await app.click("Canvas 2");
    expect(api.save.mock.calls[0]?.[0]).toBe(1);
    expect(api.save.mock.calls[0]?.[1].nodes[0].text).toBe("Body 1 edited");
    await app.click("Edit canvas fixture");
    await app.close();
    expect(api.save.mock.calls[1]?.[0]).toBe(2);
    expect(api.save.mock.calls[1]?.[1].nodes[0].text).toBe("Body 2 edited");
  });

  it("retains a failed write through remount and offers retry without losing the newer draft", async () => {
    api.save.mockRejectedValue(new Error("Write offline"));
    const app = await mount();
    await app.click("Edit canvas fixture");
    await app.close();
    expect(window.localStorage.getItem(`${CANVAS_DRAFT_PREFIX}1`)).toContain("Body 1 edited");
    const reopened = await mount();
    expect(reopened.element.querySelector("[data-editor]")?.textContent).toContain("Body 1 edited");
    expect(reopened.element.textContent).toContain("Canvas save failed");
    api.save.mockImplementation(async (id: number, content: CanvasDocumentData) => ({ ...document(id), content_json: content }));
    await reopened.click("Retry save");
    expect(reopened.element.textContent).not.toContain("Canvas save failed");
    expect(window.localStorage.getItem(`${CANVAS_DRAFT_PREFIX}1`)).toBeNull();
  });

  it("serializes a newer edit behind an in-flight save after returning to the canvas", async () => {
    let release!: () => void;
    api.save.mockImplementationOnce(async (id: number, content: CanvasDocumentData) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { ...document(id), content_json: content };
    });
    const app = await mount();
    await app.click("Edit canvas fixture");
    await app.click("Canvas 2");
    await app.click("Canvas 1");
    await app.click("Edit canvas fixture");
    expect(api.save).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await settle();
    expect(api.save.mock.calls.map((call) => call[1].nodes[0].text)).toEqual(["Body 1 edited", "Body 1 edited edited"]);
    expect(app.element.querySelector("[data-editor]")?.textContent).toContain("Body 1 edited edited");
  });

  it("restores a local draft after a fresh application session", async () => {
    const draft = document(1).content_json;
    draft.nodes[0].text = "Recovered local canvas";
    window.localStorage.setItem(`${CANVAS_DRAFT_PREFIX}1`, JSON.stringify(draft));
    const app = await mount();
    expect(app.element.querySelector("[data-editor]")?.textContent).toContain("Recovered local canvas");
    expect(app.element.textContent).toContain("Unsaved");
  });
});
