// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentDock } from "./document-dock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); });

it("uses supplied document handlers for modes and reading focus", async () => {
  const onModeChange = vi.fn();
  const onReadingFocus = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<DocumentDock mode="read" onModeChange={onModeChange} positionLabel="§2 of 5 · 1,204 words" readingFocus={false} onReadingFocus={onReadingFocus} proposalCount={2} />));
  expect(host.textContent).toContain("§2 of 5 · 1,204 words");
  expect(host.textContent).toContain("2 in panel");
  const buttons = [...host.querySelectorAll("button")];
  await act(async () => buttons.find((button) => button.textContent === "Edit")!.click());
  await act(async () => buttons.find((button) => button.textContent === "Reading focus")!.click());
  expect(onModeChange).toHaveBeenCalledWith("edit");
  expect(onReadingFocus).toHaveBeenCalledOnce();
});

it("does not offer editing for read-only or decision-busy documents", async () => {
  const onModeChange = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<DocumentDock mode="read" onModeChange={onModeChange} positionLabel="5 sections · 1,204 words" readingFocus={false} onReadingFocus={vi.fn()} proposalCount={0} readOnly decisionBusy />));
  const buttons = [...host.querySelectorAll("button")];
  expect(buttons.find((button) => button.textContent === "Reading")?.disabled).toBe(true);
  expect(buttons.find((button) => button.textContent === "Edit")?.disabled).toBe(true);
});
