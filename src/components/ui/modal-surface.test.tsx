// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppDialog } from "./app-dialog";
import { ConfirmDialog } from "./confirm-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

describe("Hermes modal surface", () => {
  it("keeps application dialogs on the shared raised, height-capped shell", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <AppDialog open title="Test modal" footer={<button>Done</button>} onOpenChange={vi.fn()}>
          Body
        </AppDialog>,
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.className).toContain("modal-surface");
    expect(dialog?.className).toContain("max-h-[86dvh]");
    expect(document.querySelector(".modal-backdrop")?.className).toContain("modal-backdrop");

    await act(async () => root.unmount());
  });

  it("uses the same surface and veil for confirmation dialogs", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <ConfirmDialog
          open
          title="Confirm"
          message="Continue?"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
    });

    expect(document.querySelector('[role="alertdialog"]')?.className).toContain("modal-surface");
    expect(document.querySelector(".modal-backdrop")?.className).toContain("modal-backdrop");

    await act(async () => root.unmount());
  });
});
