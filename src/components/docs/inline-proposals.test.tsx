// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { InlineProposals } from "./inline-proposals";
import type { DocumentProposalReview } from "@/proposals/document-review-context";

vi.mock("@/components/ui/markdown-body", () => ({ MarkdownBody: ({ content }: { content: string }) => <div>{content}</div> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); vi.clearAllMocks(); });

const review: DocumentProposalReview = {
  revision: 1,
  documentId: "doc",
  docPath: "vault:journal/document.md",
  title: "Document",
  busy: false,
  error: null,
  proposals: [{ id: "p", docPath: "vault:journal/document.md", author: "Keel", note: "", at: 1, hunks: [{ id: 0, at: 2, old: ["Old paragraph"], new: ["New paragraph"] }] }],
};

it("shows the real hunk and sends one identity-bound decision on a double click", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  let finish!: () => void;
  const onDecision = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  await act(async () => root.render(<InlineProposals review={review} onDecision={onDecision} />));
  expect(host.textContent).toContain("Old paragraph");
  expect(host.textContent).toContain("New paragraph");
  const accept = host.querySelector<HTMLButtonElement>('button[aria-label="Accept edit 1"]')!;
  await act(async () => { accept.click(); accept.click(); });
  expect(onDecision).toHaveBeenCalledOnce();
  expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({
    documentId: "doc",
    docPath: "vault:journal/document.md",
    proposalId: "p",
    taken: review.proposals[0].hunks,
  }));
  await act(async () => finish());
});

it("keeps proposal-store failures visible when no hunks can be read", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<InlineProposals review={{ ...review, proposals: [], error: "Suggested edits could not be read" }} onDecision={vi.fn()} />));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be read");
});

it("binds reject all to every hunk that was reviewed", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const onDecision = vi.fn(async () => undefined);
  await act(async () => root.render(<InlineProposals review={review} onDecision={onDecision} />));
  const reject = [...host.querySelectorAll("button")].find((button) => button.textContent === "Reject all")!;
  await act(async () => reject.click());
  expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({
    proposalId: "p",
    taken: [],
    dropped: review.proposals[0].hunks,
  }));
});
