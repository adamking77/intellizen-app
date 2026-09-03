// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamSheet } from "./team-sheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

describe("TeamSheet", () => {
  it("keeps the action row on the modal's single inherited surface", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <TeamSheet
          agents={[]}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    const cancel = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Cancel");
    expect(cancel?.parentElement?.className).not.toContain("bg-[var(--mantle)]");
    expect(cancel?.closest('[role="dialog"]')?.className).toContain("modal-surface");
    expect(cancel?.closest('[role="dialog"]')?.className).toContain("max-h-[72dvh]");

    await act(async () => root.unmount());
  });
});
