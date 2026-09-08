// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), receipt: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/lib/data/work-receipts", () => ({ recordProposalDecision: mocks.receipt }));

import { useProposals } from "./use-proposals";
import type { Hunk } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it("does not let an old document reload replace the current document", async () => {
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  mocks.invoke.mockImplementation((_command, input: { docPath: string }) => input.docPath === "one.md" ? first.promise : second.promise);
  let current!: ReturnType<typeof useProposals>;
  const Probe = ({ path }: { path: string }) => {
    const value = useProposals(path);
    useEffect(() => { current = value; }, [value]);
    return null;
  };
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Probe path="one.md" />));
  await act(async () => root.render(<Probe path="two.md" />));
  await act(async () => second.resolve([{ id: "two", docPath: "two.md", author: "Sol", note: "", at: 1, hunks: [] }]));
  await act(async () => first.resolve([{ id: "one", docPath: "one.md", author: "Sol", note: "", at: 1, hunks: [] }]));
  expect(current.proposals?.map((proposal) => proposal.id)).toEqual(["two"]);
  expect(current.error).toBeNull();
});

it("keeps the applied text and reports when the reject half only fails", async () => {
  const accepted: Hunk = { id: 0, at: 0, old: ["old"], new: ["new"] };
  const dropped: Hunk = { id: 1, at: 2, old: ["drop"], new: [] };
  mocks.receipt.mockResolvedValue(undefined);
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "proposals_list") return [];
    if (command === "proposal_accept_hunk") return "new\n";
    if (command === "proposal_reject_hunk") throw new Error("proposal file changed");
  });
  let current!: ReturnType<typeof useProposals>;
  const Probe = () => {
    const value = useProposals("report.md");
    useEffect(() => { current = value; }, [value]);
    return null;
  };
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => { await Promise.resolve(); });
  let text: string | null = null;
  await act(async () => { text = await current.accept("proposal", [accepted], [dropped]); });
  expect(text).toBe("new\n");
  expect(current.error).toContain("accepted edits were applied");
});

it("shows a proposal read failure as unknown instead of an empty list", async () => {
  mocks.invoke.mockRejectedValue(new Error("unreadable proposal store"));
  let current!: ReturnType<typeof useProposals>;
  const Probe = () => {
    const value = useProposals("report.md");
    useEffect(() => { current = value; }, [value]);
    return null;
  };
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => { await Promise.resolve(); });
  expect(current.proposals).toBeNull();
  expect(current.error).toContain("could not be read");
});
