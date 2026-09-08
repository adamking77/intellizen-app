// @vitest-environment happy-dom
import { act, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { DocumentProposalProvider, useDocumentProposalBridge, useRegisterDocumentProposal } from "./document-review-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); });

it("refuses a decision after the registered document owner changes", async () => {
  const first = vi.fn(async () => undefined);
  const second = vi.fn(async () => undefined);
  let decide!: ReturnType<typeof useDocumentProposalBridge>["decide"];
  const Owner = ({ id, action }: { id: string; action: typeof first }) => {
    const bridge = useDocumentProposalBridge();
    decide = bridge.decide;
    const registration = useMemo(() => ({ review: { documentId: id, docPath: `${id}.md`, title: id, proposals: [], busy: false, error: null }, decide: action }), [id, action]);
    return <DocumentProposalProvider register={bridge.register}><Registration id={id} registration={registration} /></DocumentProposalProvider>;
  };
  const Registration = ({ id, registration }: { id: string; registration: Parameters<typeof useRegisterDocumentProposal>[1] }) => {
    useRegisterDocumentProposal(id, registration);
    return null;
  };
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Owner id="one" action={first} />));
  await act(async () => root.render(<Owner id="two" action={second} />));
  await expect(decide({ documentId: "one", docPath: "one.md", proposalId: "p", taken: [], dropped: [] })).rejects.toThrow("open document changed");
  await decide({ documentId: "two", docPath: "two.md", proposalId: "p", taken: [], dropped: [] });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});
