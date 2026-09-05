// @vitest-environment happy-dom
import { MemoryRouter, useLocation } from "react-router-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSessions } from "./project-sessions";
import type { HermesProjectSession } from "@/services/hermes-project-sessions";

const mocks = vi.hoisted(() => ({ sessions: vi.fn(), messages: vi.fn(), events: vi.fn(), record: vi.fn() }));
vi.mock("@/services/hermes-project-sessions", () => ({ listHermesProjectSessions: mocks.sessions, getHermesSessionMessages: mocks.messages }));
vi.mock("@/lib/data/work-receipts", async (original) => ({ ...(await original<typeof import("@/lib/data/work-receipts")>()), listWorkEvents: mocks.events }));
vi.mock("@/lib/data", () => ({ getWorkspaceRecord: mocks.record }));
vi.mock("@/lib/view-transitions", () => ({ runViewTransition: (_: unknown, update: () => void) => update() }));
vi.mock("@/components/agent/reply-markdown", () => ({ ReplyMarkdown: ({ content }: { content: string }) => <p>{content}</p> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const folders = ["/project"];
const sessions: HermesProjectSession[] = ["one", "two"].map((id) => ({ id, title: `Session ${id}`, profile: "fiona", preview: "", cwd: "/project", source: null, lastActive: 1_788_000_000, messageCount: 1, failed: false, toolCallCount: 0 }));
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement; let client: QueryClient;
beforeEach(() => {
  mocks.sessions.mockResolvedValue(sessions);
  mocks.events.mockResolvedValue([]);
  mocks.messages.mockImplementation(async (id) => [{ id: `message-${id}`, role: "assistant", text: `Transcript for ${id}`, name: null, timestamp: null }]);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.clearAllMocks(); });
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); }
function LocationProbe() { const location = useLocation(); return <output data-location>{location.pathname}{location.search}</output>; }
async function render(selectedSessionKey?: string, projectId = "project") {
  await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><ProjectSessions folders={folders} projectId={projectId} selectedSessionKey={selectedSessionKey} transcriptOnly={Boolean(selectedSessionKey)} /><LocationProbe /></QueryClientProvider></MemoryRouter>));
  await settle(); await settle();
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((node) => node.textContent?.includes(text));
  expect(button, text).toBeTruthy(); await act(async () => button!.click()); await settle();
}

describe("project session continuity", () => {
  it("keeps a nonfirst session selected after Open session and a list refresh", async () => {
    await render(); expect(host.textContent).toContain("Transcript for one");
    await click("Session two"); await click("Open session");
    expect(host.textContent).toContain("Transcript for two");
    expect(host.textContent).not.toContain("Transcript for one");
    await act(async () => client.setQueryData(["hermes-project-sessions", "project", folders], sessions.map((session) => ({ ...session, messageCount: 2 }))));
    await settle();
    expect(host.textContent).toContain("Transcript for two");
  });
  it("never substitutes the first session for an explicit missing session", async () => {
    await render("fiona:missing");
    expect(host.textContent).toContain("Selected session unavailable");
    expect(host.textContent).not.toContain("Transcript for one");
    expect(mocks.messages).not.toHaveBeenCalled();
  });
  it("shows a missing explicit session honestly even when the returned list is empty", async () => {
    mocks.sessions.mockResolvedValue([]); await render("fiona:missing");
    expect(host.textContent).toContain("Selected session unavailable");
    expect(host.textContent).not.toContain("No sessions filed here");
    expect(mocks.messages).not.toHaveBeenCalled();
  });
  it("follows a changed tree selection and resets local selection for another project", async () => {
    await render("fiona:one"); expect(host.textContent).toContain("Transcript for one");
    await render("fiona:two"); expect(host.textContent).toContain("Transcript for two");
    await render(undefined, "other-project"); expect(host.textContent).toContain("Transcript for one");
  });
  it("does not replace a selected session that disappears on refresh", async () => {
    await render(); await click("Session two"); await click("Open session");
    await act(async () => client.setQueryData(["hermes-project-sessions", "project", folders], [sessions[0]])); await settle();
    expect(host.textContent).toContain("Selected session unavailable");
    expect(host.textContent).not.toContain("Transcript for one");
  });
  it("presents stored tool output as recorded and makes failure details inspectable", async () => {
    const text = `Error: permission denied. ${"context ".repeat(80)}Full failure detail.`;
    mocks.messages.mockResolvedValue([{ id: "tool-1", role: "tool", name: "read_file", text, timestamp: null }]);
    await render("fiona:one");
    const tool = host.querySelector("article");
    expect(tool?.textContent).toContain("recorded");
    expect(tool?.textContent).not.toContain("verified");
    expect(tool?.querySelector("pre")?.textContent).toBe(text);
    expect(tool?.querySelector("details")?.open).toBe(false);
  });
  it("queries only the selected session receipts and links an exact run", async () => {
    mocks.events.mockResolvedValue([{ id: "event", workflow_run_id: "exact-run", record_id: null, payload: { session_id: "one" }, created_at: "2026-01-01", event_kind: "run_completed", actor: "Keel", summary: "Recorded workflow outcome" }]);
    await render("fiona:one");
    expect(mocks.events).toHaveBeenCalledWith({ sessionId: "one", sessionProfile: "fiona", limit: 500 });
    expect(host.querySelector('a[href="/workflows?run=exact-run"]')?.textContent).toBe("Open run");
  });
  it("shows receipt failures with retry without hiding the transcript", async () => {
    mocks.events.mockRejectedValue(new Error("Receipt source offline"));
    await render("fiona:one");
    expect(host.textContent).toContain("Session receipts could not be refreshed");
    expect(host.textContent).toContain("Transcript for one");
    expect(host.textContent).not.toContain("No receipts are linked");
    mocks.events.mockResolvedValue([]); await click("Retry receipts"); await settle();
    expect(host.textContent).toContain("No receipts are linked to this session");
  });
  it("keeps receipts inspectable for a session with no readable transcript", async () => {
    mocks.messages.mockResolvedValue([]);
    mocks.events.mockResolvedValue([{ id: "event", workflow_run_id: "exact-run", record_id: null, payload: { session_key: "fiona:one" }, created_at: "2026-01-01", event_kind: "run_completed", actor: "Keel", summary: "Recorded workflow outcome" }]);
    await render("fiona:one");
    expect(host.textContent).toContain("No transcript");
    expect(host.querySelector('a[href="/workflows?run=exact-run"]')).toBeTruthy();
  });

  it("opens a recorded output in its actual database and exact record", async () => {
    mocks.events.mockResolvedValue([{ id: "event", workflow_run_id: null, record_id: "output-record", payload: { session_id: "one" }, created_at: "2026-01-01", event_kind: "record_created", actor: "Keel", summary: "Output created" }]);
    mocks.record.mockResolvedValue({ id: "output-record", database_id: "actual-database" });
    await render("fiona:one"); await click("Open record");
    expect(mocks.record).toHaveBeenCalledWith("output-record");
    expect(host.querySelector("[data-location]")?.textContent).toBe("/databases/actual-database?record=output-record");
  });
  it("keeps loaded receipts visible when their background refresh fails", async () => {
    mocks.events.mockResolvedValue([{ id: "event", workflow_run_id: "older-run", record_id: null, payload: { session_id: "one" }, created_at: "2026-01-01", event_kind: "run_completed", actor: "Keel", summary: "Existing receipt" }]);
    await render("fiona:one");
    mocks.events.mockRejectedValue(new Error("Offline"));
    await act(async () => client.refetchQueries({ queryKey: ["work-events", "session", "fiona", "one"] })); await settle();
    expect(host.textContent).toContain("Session receipts could not be refreshed");
    expect(host.querySelector('a[href="/workflows?run=older-run"]')).toBeTruthy();
  });

});
