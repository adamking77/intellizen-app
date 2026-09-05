// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({ accept: vi.fn(), reject: vi.fn() }));
vi.mock("@/proposals/use-proposals", () => ({ useProposals: () => ({ ...model, busy: false, error: null, proposals: [{ id: "p", author: "Keel", hunks: [{ id: 0, at: 2, old: ["Old **paragraph**"], new: ["New **paragraph**"] }] }] }) }));
vi.mock("@/components/ui/markdown-body", () => ({ MarkdownBody: ({ content }: { content: string }) => <div>{content}</div> }));
import { InlineProposals } from "./inline-proposals";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); vi.clearAllMocks(); });
it("waits for the document writer and leaves the proposal untouched if saving fails", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  let release!: (allowed: boolean) => void;
  const beforeDecision = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
  const onApplied = vi.fn(); const onDecisionChange = vi.fn();
  model.accept.mockResolvedValue("accepted raw");
  await act(async () => root.render(<InlineProposals path="document.md" raw={'# Title\n\nOld **paragraph**'} title="Title" beforeDecision={beforeDecision} onDecisionChange={onDecisionChange} onApplied={onApplied} />));
  const accept = host.querySelector<HTMLButtonElement>('button[aria-label="Accept edit 1"]')!;
  await act(async () => accept.click());
  expect(model.accept).not.toHaveBeenCalled(); expect(accept.disabled).toBe(true);
  await act(async () => release(false));
  expect(model.accept).not.toHaveBeenCalled(); expect(accept.disabled).toBe(false);
  await act(async () => accept.click());
  await act(async () => release(true));
  expect(model.accept).toHaveBeenCalledOnce(); expect(onApplied).toHaveBeenCalledWith("accepted raw");
  expect(onDecisionChange.mock.calls.map(([busy]) => busy)).toEqual([true, false, true, false]);
});
