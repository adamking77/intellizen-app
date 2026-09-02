// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ProposalCard } from "@/proposals/proposal-strip";
import { proposalStat, type Proposal } from "@/proposals/types";

const proposal: Proposal = {
  id: "prop-1",
  docPath: "Report.md",
  author: "Ada",
  note: "Tighten the opening",
  at: 1,
  hunks: [
    { id: 0, at: 0, old: ["one"], new: ["ONE", "and a half"] },
    { id: 1, at: 3, old: ["four"], new: [] },
  ],
};

async function render(onAccept = vi.fn(), onReject = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<ProposalCard proposal={proposal} onAccept={onAccept} onReject={onReject} />),
  );
  const click = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
    if (!button) throw new Error(`no button ${label}`);
    await act(async () => button.click());
  };
  return { container, click, onAccept, onReject };
}

describe("ProposalCard", () => {
  it("counts the hunks still taken and offers every one to start", async () => {
    const { container } = await render();
    expect(proposalStat(proposal.hunks)).toEqual({ added: 2, removed: 2 });
    expect(container.textContent).toContain("+2");
    expect(container.textContent).toContain("−2");
    expect(container.querySelectorAll("input[type=checkbox]:checked")).toHaveLength(2);
    expect(container.querySelector("[data-rejected]")).toBeNull();
  });

  it("unticking a hunk moves it to dropped, relabels Accept, and says so in words", async () => {
    const { container, click, onAccept } = await render();
    const box = container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1];
    await act(async () => box.click());
    expect(container.querySelector("[data-rejected]")).not.toBeNull();
    expect(container.textContent).toContain("not taken");
    expect(container.textContent).toContain("+2 −1");
    await click("Accept 1");
    expect(onAccept).toHaveBeenCalledWith([proposal.hunks[0]], [proposal.hunks[1]]);
  });

  it("Discard rejects the whole thing and Hide collapses the diff", async () => {
    const { container, click, onReject } = await render();
    await click("Discard");
    expect(onReject).toHaveBeenCalledTimes(1);
    await click("Hide");
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(0);
    expect(container.textContent).toContain("Review");
  });
});
