// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReportsView } from "./Reports";
import type { WorkspaceDatabaseBundle, WorkspaceDatabaseRecordModel } from "@/lib/types";
const mocks = vi.hoisted(() => ({ bundle: vi.fn(), workflows: vi.fn(), sync: vi.fn(), publish: vi.fn(), inventory: vi.fn(), mount: vi.fn() }));
vi.mock("@/lib/data", async () => ({ GENZEN_WORKSPACE_DATABASE_IDS: { workflowRegistry: "registry" }, DOCUMENTS_DB_FIELDS: (await import("@/lib/documents")).DOCUMENTS_DB_FIELDS, getDocumentsWorkspaceBundle: mocks.bundle, listWorkflows: mocks.workflows, syncVaultFilesToDocumentRecords: mocks.sync, createRecordFromTemplate: vi.fn(), deleteVaultFile: vi.fn(), deleteWorkspaceRecord: vi.fn(), listAllVaultFiles: vi.fn(), saveRecordAsTemplate: vi.fn(), updateWorkspaceRecord: vi.fn() }));
vi.mock("@/components/docs/docs-rail", () => ({ DocsRail: ({ records, onSelect }: { records: WorkspaceDatabaseRecordModel[]; onSelect: (id: string) => void }) => <nav aria-label="Documents">{records.map((record) => <button key={record.id} onClick={() => onSelect(record.id)}>{String(record.doc_title)}</button>)}</nav> }));
vi.mock("@/components/docs/document-page", () => ({ DocumentPage: ({ record }: { record: WorkspaceDatabaseRecordModel }) => { const [instance] = useState(() => { mocks.mount(record.id); return mocks.mount.mock.calls.length; }); return <article data-document={record.id} data-instance={instance}><h1>{String(record.doc_title)}</h1><textarea aria-label="Document content" defaultValue={record._body} /></article>; } }));
vi.mock("@/lib/conversation-context", async (original) => ({ ...await original<typeof import("@/lib/conversation-context")>(), publishConversationContext: mocks.publish }));
vi.mock("@/lib/document-persistence", () => ({ createPortableDocument: vi.fn() }));
vi.mock("@/lib/vault", () => ({ readVaultFile: vi.fn(), removeVaultFile: vi.fn(), writeVaultFile: vi.fn(), listVaultDocuments: mocks.inventory, createVaultDirectory: vi.fn() }));
vi.mock("@/lib/use-window-size", () => ({ useWindowSize: () => ({ isCramped: false }) }));
vi.mock("@/lib/use-hierarchy", () => ({ useHierarchy: () => ({ tree: [] }) }));
vi.mock("@/lib/hierarchy", () => ({ allProjects: () => [] }));
vi.mock("@/proposals/use-proposals", () => ({ useProposalCounts: () => ({}) }));
vi.mock("@/store", () => ({ useAppStore: (selector: (state: { entityFilter: null }) => unknown) => selector({ entityFilter: null }) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn() }, toastError: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement; let client: QueryClient;
function bundle(): WorkspaceDatabaseBundle { return { database: { id: "documents" }, records: [{ id: "first", body: "First body", fields: { doc_title: "First document" }, created_at: "2026-09-01", updated_at: "2026-09-03" }, { id: "second", body: "Second body", fields: { doc_title: "Second document" }, created_at: "2026-09-01", updated_at: "2026-09-02" }] } as unknown as WorkspaceDatabaseBundle; }
beforeEach(() => { mocks.inventory.mockResolvedValue({ files: [], folders: [], errors: [] }); mocks.bundle.mockResolvedValue(bundle()); mocks.workflows.mockResolvedValue([]); mocks.sync.mockResolvedValue(undefined); host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); localStorage.clear(); vi.clearAllMocks(); });
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-location>{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate("/docs?record=missing")}>Open unavailable</button></>; }
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); }); }
async function render(url = "/docs?record=second") { await act(async () => root.render(<MemoryRouter initialEntries={[url]}><QueryClientProvider client={client}><ReportsView /><Probe /></QueryClientProvider></MemoryRouter>)); await settle(); await settle(); }
async function click(label: string) { const button = [...host.querySelectorAll("button")].find((node) => node.textContent === label); expect(button).toBeTruthy(); await act(async () => button!.click()); await settle(); }
it("keeps the exact requested document through selection, back navigation, and reordered refetch", async () => {
  await render(); expect(host.querySelector("[data-document]")?.getAttribute("data-document")).toBe("second");
  await click("First document"); expect(host.querySelector("[data-location]")?.textContent).toBe("/docs?record=first");
  await click("Browser back"); expect(host.querySelector("[data-document]")?.getAttribute("data-document")).toBe("second");
  mocks.bundle.mockResolvedValue({ ...bundle(), records: bundle().records.reverse() });
  await act(async () => { await client.refetchQueries({ queryKey: ["docs-workspace-bundle"] }); }); await settle();
  expect(host.querySelector("[data-document]")?.getAttribute("data-document")).toBe("second");
  expect(host.querySelector("[data-location]")?.textContent).toBe("/docs?record=second");
});
it("shows an unavailable explicit document without substituting the first record", async () => {
  await render("/docs?record=missing");
  expect(host.textContent).toContain("Document unavailable"); expect(host.querySelector("[data-document]")).toBeNull();
  expect(host.querySelector("[data-location]")?.textContent).toBe("/docs?record=missing");
  expect(mocks.publish).not.toHaveBeenCalled();
});
it("publishes the exact selected document as current material after each navigation", async () => {
  await render(); expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ route: expect.objectContaining({ pathname: "/docs", search: "?record=second" }), selections: [{ kind: "document", documentId: "second", label: "Second document" }] }));
  await click("First document"); expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ selections: [{ kind: "document", documentId: "first", label: "First document" }] }));
});
it("retains the mounted document and its local input through a pending and failed background refresh", async () => {
  await render(); const editor = host.querySelector("[data-document]")!; const input = editor.querySelector("textarea")!; input.value = "Unsaved local content";
  let reject!: (error: Error) => void; mocks.bundle.mockImplementationOnce(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
  let refresh!: Promise<void>; await act(async () => { refresh = client.refetchQueries({ queryKey: ["docs-workspace-bundle"] }); }); await settle();
  expect(host.querySelector("[data-document]")).toBe(editor); expect(input.value).toBe("Unsaved local content");
  await act(async () => { reject(new Error("Offline")); await refresh; }); await settle();
  expect(host.querySelector("[data-document]")).toBe(editor); expect(input.value).toBe("Unsaved local content"); expect(mocks.mount).toHaveBeenCalledTimes(1);
});

it("shares a SOP as its actual Registry record rather than a Documents record", async () => {
  mocks.workflows.mockResolvedValue([{ id: "sop", workflow_id: "sop-procedure", name: "Procedure", definition: null, owner_role: "chief_engineer", updated_at: "2026-09-04", body_preview: "Procedure source" }]);
  await render("/docs?record=sop");
  expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ selections: [{ kind: "workspace_record", databaseId: "registry", recordId: "sop", label: "Procedure" }] }));
});
it('opens the vault file by reference without fabricating a workspace document ID', async () => {
  mocks.inventory.mockResolvedValue({ files: [{path:'journal/local.md',name:'local.md'}],folders:['journal'],errors:[] });
  await render('/docs?record=vault%3Ajournal%2Flocal.md');
  expect(host.querySelector('[data-document]')?.getAttribute('data-document')).toBe('vault:journal/local.md');
  expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({selections:[{kind:'vault_file',path:'journal/local.md',label:'Local'}]}));
});
it('leaves the folder browser at rest instead of automatically opening the first document', async () => {
  await render('/docs'); expect(host.querySelector('[data-document]')).toBeNull();
  expect(host.textContent).toContain('Select a document');
});
