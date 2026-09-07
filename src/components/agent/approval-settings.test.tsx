// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { ApprovalSettings } from "./approval-settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => document.body.replaceChildren());

it("only saves an explicit profile-wide choice and shows a separate session bypass", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const read = vi.fn(async () => "manual" as const);
  const save = vi.fn(async () => "smart" as const);
  await act(async () => root.render(<ApprovalSettings profile="fiona" sessionId="s1" effectiveMode="off" read={read} save={save} />));

  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Approval settings"]')!.click());
  expect(read).toHaveBeenCalledWith("fiona", "s1");
  expect(save).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("session separately bypasses approvals");

  await act(async () => document.querySelector<HTMLInputElement>('input[value="smart"]')!.click());
  await act(async () => Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Save")!.click());
  expect(save).toHaveBeenCalledWith("fiona", "s1", "smart");
  await act(async () => root.unmount());
});

it("does not apply a late read to a different profile", async () => {
  let resolve!: (mode: "manual") => void;
  const read = vi.fn(() => new Promise<"manual">((done) => { resolve = done; }));
  const save = vi.fn(async () => "manual" as const);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<ApprovalSettings profile="fiona" sessionId="s1" effectiveMode="manual" read={read} save={save} />));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Approval settings"]')!.click());
  await act(async () => root.render(<ApprovalSettings profile="keel" sessionId="s2" effectiveMode="smart" read={read} save={save} />));
  await act(async () => resolve("manual"));
  expect(document.querySelector<HTMLDialogElement>('[role="dialog"]')?.open).toBe(false);
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="Approval settings"]')?.textContent).toBe("Ask when unsure");
  await act(async () => root.unmount());
});
